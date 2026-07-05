import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BATCH_ROOT =
  '/Users/moiz/Documents/code/hack-raise-visual-integrity/apps/autoend/.visual-integrity/demo-runs/batch-2026-07-05T01-43-03-437Z';
const BASE_URL = 'http://127.0.0.1:8765';

interface ManifestTarget {
  label: string;
  url: string;
  slug: string;
  status: string;
  violations: string[];
  indexHtml?: string;
}

const manifest = JSON.parse(await readFile(join(BATCH_ROOT, 'manifest.json'), 'utf8')) as {
  batchId: string;
  targets: ManifestTarget[];
};

// Pre-flight: unique slugs
const slugs = manifest.targets.map((t) => t.slug);
const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dupes.length) {
  console.error(`FATAL: duplicate slugs in manifest: ${[...new Set(dupes)].join(', ')}`);
  process.exitCode = 1;
}

type CheckResult = {
  label: string;
  slug: string;
  ok: boolean;
  issues: string[];
};

const results: CheckResult[] = [];
const browser = await chromium.launch();

for (const target of manifest.targets) {
  const issues: string[] = [];
  const dir = join(BATCH_ROOT, target.slug);
  const reportPath = join(dir, 'report.json');
  const indexPath = join(dir, 'index.html');

  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const indexHtml = await readFile(indexPath, 'utf8');
    const vCount = (report.violations ?? []).length;

    // Embedded JSON present
    if (!indexHtml.includes('id="report-data"')) issues.push('index.html missing embedded report-data script');
    if (!indexHtml.includes('"runId"')) issues.push('index.html missing embedded JSON payload');

    // Required assets referenced in report
    const assetFiles = [
      report.actualFile,
      report.topRegionFile,
      report.expectedFile,
      report.diffFile,
      ...(report.expectedArtifacts ?? []).map((a: { file: string }) => a.file),
    ].filter(Boolean) as string[];

    for (const file of new Set(assetFiles)) {
      try {
        const buf = await readFile(join(dir, file));
        if (buf.length < 100) issues.push(`asset too small: ${file} (${buf.length}b)`);
      } catch {
        issues.push(`missing asset: ${file}`);
      }
    }

    // Embedded JSON parses and matches report.json
    const embeddedMatch = indexHtml.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (!embeddedMatch) {
      issues.push('index.html missing parseable report-data script');
    } else {
      try {
        const embedded = JSON.parse(embeddedMatch[1]);
        if (embedded.runId !== report.runId) issues.push('embedded runId mismatch');
        if ((embedded.violations ?? []).length !== vCount) issues.push('embedded violation count mismatch');
      } catch {
        issues.push('embedded report-data JSON invalid');
      }
    }

    // Violation count consistency
    if (target.status === 'pass' && vCount !== 0) {
      issues.push(`manifest says pass but report has ${vCount} violation(s)`);
    }
    if (target.status === 'fail' && vCount === 0) {
      issues.push('manifest says fail but report has 0 violations');
    }
    if (target.status === 'fail') {
      const ids = (report.violations ?? []).map((v: { ruleId: string }) => v.ruleId);
      for (const expected of target.violations) {
        if (!ids.includes(expected)) issues.push(`missing expected violation ${expected}`);
      }
    }

    // Browser UI checks
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      const url = `${BASE_URL}/${target.slug}/index.html`;
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      if (!resp || resp.status() !== 200) issues.push(`HTTP ${resp?.status() ?? 'no response'} for ${url}`);

      await page.waitForTimeout(800);

      const appVisible = await page.locator('#app').isVisible();
      if (!appVisible) issues.push('#app not visible');

      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (scrollHeight > 904) issues.push(`page scrolls (${scrollHeight}px > 904)`);

      const brokenImages = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src);
      });
      if (brokenImages.length > 0) issues.push(`broken images: ${brokenImages.length}`);

      if (target.status === 'pass') {
        const passed = await page.getByText(/No violations found/i).isVisible();
        if (!passed) issues.push('pass report missing "No violations found" heading');
        const compare = await page.locator('#compare').isVisible();
        if (!compare) issues.push('pass report missing #compare instrument');
        const pipeline = await page.locator('.pipeline').isVisible();
        if (!pipeline) issues.push('pass report missing pipeline strip');
      } else {
        const lockup = await page.locator('.lockup .count').isVisible();
        if (!lockup) issues.push('fail report missing verdict lockup count');
        const compare = await page.locator('#compare').isVisible();
        if (!compare) issues.push('fail report missing #compare instrument');
        const pagemap = await page.locator('#pagemap').isVisible();
        if (!pagemap) issues.push('fail report missing #pagemap instrument');
        const pipeline = await page.locator('.pipeline').isVisible();
        if (!pipeline) issues.push('fail report missing pipeline strip');
      }

      // Compare slider interaction (fail reports)
      if (target.status === 'fail') {
        const cmp = await page.locator('#compare').boundingBox();
        if (cmp) {
          await page.mouse.move(cmp.x + cmp.width * 0.5, cmp.y + cmp.height * 0.5);
          await page.mouse.down();
          await page.mouse.move(cmp.x + cmp.width * 0.85, cmp.y + cmp.height * 0.5);
          await page.mouse.up();
        }
        const specVisible = await page.locator('#compare img').first().isVisible();
        if (!specVisible) issues.push('compare slider images not visible after drag');
        const specBtn = page.locator('.layer[data-l="spec"]');
        await specBtn.click();
        if (!(await page.locator('#lyrExpected').isHidden())) issues.push('spec toggle did not hide #lyrExpected');
        const absent = page.getByText(/required here — not found/i);
        if (await absent.count()) {
          if (!(await absent.isHidden())) issues.push('spec toggle did not hide absence annotation');
        }
        await specBtn.click();
        if (!(await page.locator('#lyrExpected').isVisible())) issues.push('spec toggle did not restore #lyrExpected');
      }
    } finally {
      await page.close();
    }
  } catch (e) {
    issues.push(e instanceof Error ? e.message.split('\n')[0] : String(e));
  }

  results.push({ label: target.label, slug: target.slug, ok: issues.length === 0, issues });
  console.log(`${issues.length === 0 ? 'OK' : 'FAIL'}\t${target.label}\t${target.slug}${issues.length ? '\t' + issues.join('; ') : ''}`);
}

await browser.close();

// Gallery checks
const galleryIssues: string[] = [];
const gPage = await chromium.launch().then(async (b) => {
  const p = await b.newPage();
  const r = await p.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  if (!r || r.status() !== 200) galleryIssues.push('gallery HTTP not 200');
  const links = await p.locator('table a').count();
  if (links !== manifest.targets.length) galleryIssues.push(`gallery has ${links} links, expected ${manifest.targets.length}`);
  for (const target of manifest.targets) {
    const href = `${BASE_URL}/${target.slug}/index.html`;
    const resp = await p.goto(href, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!resp || resp.status() !== 200) galleryIssues.push(`gallery link 404: ${target.slug}`);
  }
  await p.close();
  await b.close();
});

console.log('\n=== GALLERY ===');
console.log(galleryIssues.length === 0 ? 'OK\tbatch gallery' : `FAIL\t${galleryIssues.join('; ')}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} reports OK`);
process.exitCode = failed.length > 0 || galleryIssues.length > 0 ? 1 : 0;
