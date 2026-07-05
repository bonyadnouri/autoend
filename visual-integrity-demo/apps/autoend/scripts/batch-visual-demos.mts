#!/usr/bin/env node
/**
 * Batch Visual Integrity demos — one report dir per target + gallery index.
 *
 * Usage:
 *   pnpm visual:batch                              # timestamped under .visual-integrity/
 *   pnpm visual:showcase                           # stable gitignored showcase/ folder
 *   pnpm exec tsx scripts/batch-visual-demos.mts --out ../../showcase/visual-integrity
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { analyzeVisualIntegrity } from '../src/visual/analyze.js';
import { buildStandaloneReport } from '../src/visual/standalone-report.js';
import { renderStandaloneViewerHtml } from '../src/visual/standalone-viewer.js';
import { getRulePack, listRulePacks } from '../src/visual/rules.js';

export interface DemoTarget {
  url: string;
  rulePack: string;
  label: string;
}

export const TARGETS: DemoTarget[] = [
  { label: 'White House', url: 'https://www.whitehouse.gov/', rulePack: 'uswds-federal' },
  { label: 'NASA', url: 'https://www.nasa.gov/', rulePack: 'uswds-federal' },
  { label: 'Weather.gov (NWS)', url: 'https://www.weather.gov/', rulePack: 'uswds-federal' },
  { label: 'NOAA (compliant sibling)', url: 'https://www.noaa.gov/', rulePack: 'uswds-federal' },
  { label: 'USA.gov (compliant)', url: 'https://www.usa.gov/', rulePack: 'uswds-federal' },
  { label: 'Plan Finder (violator)', url: 'https://finder.healthcare.gov/', rulePack: 'cms-healthcare' },
  { label: 'HealthCare.gov (compliant)', url: 'https://www.healthcare.gov/', rulePack: 'cms-healthcare' },
  { label: 'Service-Public.fr', url: 'https://www.service-public.fr/', rulePack: 'dsfr-france' },
  { label: 'Gouvernement.fr', url: 'https://www.gouvernement.fr/', rulePack: 'dsfr-france' },
  { label: 'Impots.gouv.fr', url: 'https://www.impots.gouv.fr/', rulePack: 'dsfr-france' },
  { label: 'Ameli.fr (health)', url: 'https://www.ameli.fr/', rulePack: 'dsfr-france' },
  { label: 'Google Search', url: 'https://www.google.com/', rulePack: 'google-material' },
  { label: 'Google Scholar (legacy UI)', url: 'https://scholar.google.com/', rulePack: 'google-material' },
  { label: 'Google Patents (legacy UI)', url: 'https://patents.google.com/', rulePack: 'google-material' },
  { label: 'Google Maps', url: 'https://www.google.com/maps', rulePack: 'google-material' },
];

type ManifestRow = {
  label: string;
  url: string;
  rulePack: string;
  slug: string;
  status: 'pass' | 'fail' | 'error' | 'skipped';
  violations: string[];
  reportDir?: string;
  indexHtml?: string;
  error?: string;
};

function slugForUrl(url: string): string {
  const u = new URL(url);
  return `${u.hostname}${u.pathname.replace(/\//g, '-')}`.replace(/\./g, '-').replace(/-+$/, '') || 'root';
}

const HANDOFF_MD = `# Visual Integrity showcase (local only)

This folder is **gitignored** — share it with teammates via zip, cloud drive, or a
shared machine path, not via git.

## Quick start

1. Open the gallery: \`index.html\` in this folder (double-click or \`open index.html\`).
2. Hero demo (Plan Finder violation): \`finder-healthcare-gov/index.html\`
3. Compliant baseline example: \`www-usa-gov/index.html\`

## Serve over HTTP (recommended for iframes)

\`\`\`bash
cd showcase/visual-integrity
python3 -m http.server 8765
# → http://127.0.0.1:8765/
\`\`\`

## Regenerate

From \`apps/autoend\`:

\`\`\`bash
pnpm visual:showcase
\`\`\`

## Zip for handoff

\`\`\`bash
pnpm visual:showcase:zip
# → showcase/visual-integrity-bundle.zip (also gitignored)
\`\`\`

## Integrating into a deck or app

- Gallery \`manifest.json\` lists every site, status, rule pack, and violation ids.
- Each subfolder is self-contained (\`index.html\` + PNGs + \`report.json\`).
- Embed an iframe pointing at a report path, or link directly to \`index.html\`.
`;

export async function runBatchVisualDemos(batchRoot: string, batchId: string): Promise<void> {
  await mkdir(batchRoot, { recursive: true });

  const manifest: ManifestRow[] = [];
  const browser = await chromium.launch();
  const repoRoot = join(process.cwd(), '..', '..');

  try {
    for (const target of TARGETS) {
      const slug = slugForUrl(target.url);
      const outputDir = join(batchRoot, slug);
      await mkdir(outputDir, { recursive: true });
      const pack = getRulePack(target.rulePack);
      if (!pack) {
        manifest.push({
          label: target.label,
          url: target.url,
          rulePack: target.rulePack,
          slug,
          status: 'skipped',
          violations: [],
          error: `unknown rule pack: ${target.rulePack}`,
        });
        continue;
      }

      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });
      const page = await ctx.newPage();
      try {
        await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(6000);
        const result = await analyzeVisualIntegrity({
          page,
          browser,
          target: new URL(target.url),
          outputDir,
          repoRoot,
          rulePackId: target.rulePack,
          mode: 'rules',
          idPrefix: `batch-${slug}`,
        });

        if (!result.applied || !result.capture) {
          manifest.push({
            label: target.label,
            url: target.url,
            rulePack: target.rulePack,
            slug,
            status: 'error',
            violations: [],
            error: 'capture or rule pack failed',
          });
          continue;
        }

        const report = buildStandaloneReport({
          runId: `${batchId}-${slug}`,
          target: result.capture.url,
          rulePackId: result.rulePackId ?? target.rulePack,
          rulePackTitle: listRulePacks().find((p) => p.id === result.rulePackId)?.title ?? target.rulePack,
          capture: result.capture,
          expected: result.expected,
          overlays: result.overlays,
          violations: result.violations,
          diffFile: result.diff?.diffFile,
          changedPixels: result.diff?.changedPixels,
          changedRatio: result.diff?.changedRatio,
          timings: result.timings,
        });

        await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
        await writeFile(join(outputDir, 'index.html'), renderStandaloneViewerHtml(report));

        const status = result.violations.length === 0 ? 'pass' : 'fail';
        console.log(
          `${status === 'pass' ? 'PASS' : 'FAIL'}\t${target.label}\t${result.violations.map((v) => v.ruleId).join(', ') || '—'}`,
        );
        manifest.push({
          label: target.label,
          url: target.url,
          rulePack: target.rulePack,
          slug,
          status,
          violations: result.violations.map((v) => v.ruleId),
          reportDir: outputDir,
          indexHtml: join(outputDir, 'index.html'),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
        console.log(`ERROR\t${target.label}\t${msg}`);
        manifest.push({
          label: target.label,
          url: target.url,
          rulePack: target.rulePack,
          slug,
          status: 'error',
          violations: [],
          error: msg,
        });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  await writeFile(join(batchRoot, 'manifest.json'), JSON.stringify({ batchId, generatedAt: new Date().toISOString(), targets: manifest }, null, 2));
  await writeFile(join(batchRoot, 'HANDOFF.md'), HANDOFF_MD);

  const rows = manifest
    .map((row) => {
      const badge =
        row.status === 'pass'
          ? '<span class="pass">PASS</span>'
          : row.status === 'fail'
            ? '<span class="fail">FAIL</span>'
            : '<span class="err">ERROR</span>';
      const relReport = `${row.slug}/index.html`;
      const link = row.indexHtml ? `<a href="${relReport}">${new URL(row.url).hostname}</a>` : new URL(row.url).hostname;
      return `<tr><td>${badge}</td><td>${row.label}</td><td>${link}</td><td>${row.rulePack}</td><td>${row.violations.join(', ') || '—'}</td></tr>`;
    })
    .join('\n');

  const gallery = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Visual Integrity Showcase</title>
<style>
body{font-family:system-ui,sans-serif;margin:32px;background:#0f1117;color:#e8eaed}
h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #2a2f3a;font-size:14px}
.pass{color:#34a853;font-weight:700}.fail{color:#ea4335;font-weight:700}.err{color:#fbbc04;font-weight:700}
a{color:#8ab4f8}
</style></head><body>
<h1>Visual Integrity showcase</h1>
<p>${manifest.filter((m) => m.status === 'fail').length} failures · ${manifest.filter((m) => m.status === 'pass').length} passes · ${manifest.filter((m) => m.status === 'error').length} errors · batch ${batchId}</p>
<p><a href="finder-healthcare-gov/index.html">Hero: Plan Finder violation</a></p>
<table><thead><tr><th>Status</th><th>Label</th><th>Site</th><th>Rule pack</th><th>Violations</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;

  await writeFile(join(batchRoot, 'index.html'), gallery);
  console.log(`\nGallery: ${join(batchRoot, 'index.html')}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      showcase: { type: 'boolean', default: false },
    },
  });

  const repoRoot = join(process.cwd(), '..', '..');
  const batchId = new Date().toISOString().replace(/[:.]/g, '-');

  let batchRoot: string;
  if (values.showcase || values.out?.includes('showcase')) {
    batchRoot = join(repoRoot, 'showcase', 'visual-integrity');
    await rm(batchRoot, { recursive: true, force: true });
    console.log(`Building teammate showcase at ${batchRoot} (gitignored)`);
  } else if (values.out) {
    batchRoot = join(process.cwd(), values.out);
  } else {
    batchRoot = join(process.cwd(), '.visual-integrity', 'demo-runs', `batch-${batchId}`);
  }

  await runBatchVisualDemos(batchRoot, batchId);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
