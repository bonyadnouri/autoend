import { readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeVisualIntegrity } from '../src/visual/analyze.js';
import { buildStandaloneReport } from '../src/visual/standalone-report.js';
import { renderStandaloneViewerHtml } from '../src/visual/standalone-viewer.js';
import { listRulePacks } from '../src/visual/rules.js';

const DEMO_TARGET = new URL('https://finder.healthcare.gov/');
const E2E_TIMEOUT_MS = 90_000;

let browser: Browser;
let tempDirs: string[] = [];

async function tempOutputDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'visual-integrity-e2e-'));
  tempDirs.push(dir);
  return dir;
}

beforeAll(async () => {
  browser = await chromium.launch();
}, E2E_TIMEOUT_MS);

afterAll(async () => {
  await browser?.close();
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('visual integrity e2e', () => {
  it(
    'detects the missing USA Banner (and not a false-positive header) and renders the redesigned report',
    async () => {
      const outputDir = await tempOutputDir();
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      try {
        const result = await analyzeVisualIntegrity({
          page,
          browser,
          target: DEMO_TARGET,
          outputDir,
          rulePackId: 'cms-healthcare',
          mode: 'rules',
          providerId: 'none',
          effort: 'off',
          idPrefix: 'visual-e2e',
        });

        expect(result.applied).toBe(true);
        expect(result.capture).toBeDefined();
        expect(result.capture?.topRegionText.length).toBeGreaterThan(0);
        // The HealthCare.gov logo is present (as an <img alt>), so the header
        // rule must NOT fire — only the genuinely-absent USA Banner should.
        expect(result.violations.map((v) => v.ruleId)).toEqual(['CMS-HCGOV-BANNER-001']);
        expect(result.findings.length).toBe(1);
        expect(result.overlays.length).toBeGreaterThan(0);

        const runId = 'e2e-run';
        const report = buildStandaloneReport({
          runId,
          target: DEMO_TARGET.href,
          rulePackId: result.rulePackId ?? 'cms-healthcare',
          rulePackTitle:
            listRulePacks().find((p) => p.id === result.rulePackId)?.title ?? 'CMS / HealthCare.gov Design System',
          capture: result.capture!,
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

        const reportJson = JSON.parse(await readFile(join(outputDir, 'report.json'), 'utf8'));
        expect(reportJson.violations).toHaveLength(1);

        const viewer = await browser.newPage();
        try {
          await viewer.setViewportSize({ width: 1440, height: 900 });
          await viewer.goto(`file://${join(outputDir, 'index.html')}`);
          await viewer.waitForTimeout(600);
          // One-viewport dashboard: content must fit the viewport (≤4px slack for subpixel borders).
          const scrollHeight = await viewer.evaluate(() => document.documentElement.scrollHeight);
          expect(scrollHeight).toBeLessThanOrEqual(904);
          // Finding rail: human title primary, rule id secondary; header rule absent.
          expect(await viewer.getByRole('heading', { name: /Missing required USA Banner/i }).isVisible()).toBe(true);
          expect(await viewer.locator('.rule-id').filter({ hasText: 'CMS-HCGOV-BANNER-001' }).isVisible()).toBe(true);
          expect(await viewer.getByText('CMS-HCGOV-HEADER-002').count()).toBe(0);
          // Verdict lockup + masthead chip.
          expect(await viewer.locator('.lockup .count').isVisible()).toBe(true);
          expect(await viewer.getByText(/1 violation/i).first().isVisible()).toBe(true);
          expect(await viewer.getByText(/Violation detected/i).isVisible()).toBe(true);
          // Instrument A: drag-cut spec comparison with spec + live imagery.
          expect(await viewer.locator('#compare').isVisible()).toBe(true);
          expect(await viewer.locator('#cutGrab').isVisible()).toBe(true);
          expect(await viewer.locator('#compare img').count()).toBeGreaterThanOrEqual(2);
          // The absence annotation must stay visible even with the cut far right
          // (it lives on a dedicated top layer imagery can never occlude).
          const cmp = (await viewer.locator('#compare').boundingBox())!;
          await viewer.mouse.move(cmp.x + cmp.width * 0.42, cmp.y + cmp.height * 0.5);
          await viewer.mouse.down();
          await viewer.mouse.move(cmp.x + cmp.width * 0.9, cmp.y + cmp.height * 0.5);
          await viewer.mouse.up();
          expect(await viewer.getByText(/required here — not found/i).isVisible()).toBe(true);
          // Pixel delta layer is opt-in and self-explanatory when enabled.
          await viewer.locator('.layer[data-l="delta"]').click();
          expect(await viewer.locator('#lyrDelta').isVisible()).toBe(true);
          expect(await viewer.getByText(/differ from the spec render/i).isVisible()).toBe(true);
          // Spec region toggle hides/shows the spec render + absence annotation.
          const specBtn = viewer.locator('.layer[data-l="spec"]');
          await specBtn.click();
          expect(await viewer.locator('#lyrExpected').isHidden()).toBe(true);
          expect(await viewer.getByText(/required here — not found/i).isHidden()).toBe(true);
          await specBtn.click();
          expect(await viewer.locator('#lyrExpected').isVisible()).toBe(true);
          expect(await viewer.getByText(/required here — not found/i).isVisible()).toBe(true);
          // Instrument B: page map draws detected-element boxes.
          expect(await viewer.locator('#pagemap').isVisible()).toBe(true);
          expect(await viewer.locator('#mapBoxes .bx-dom').count()).toBeGreaterThan(0);
          // CV pipeline strip is visible with stage telemetry.
          expect(await viewer.locator('.pipeline').isVisible()).toBe(true);
          expect(await viewer.getByText(/Rule check/i).isVisible()).toBe(true);
        } finally {
          await viewer.close();
        }
      } finally {
        await context.close();
      }
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'standalone CLI exits with violations and writes artifacts',
    async () => {
      const outRoot = await tempOutputDir();
      const { spawnSync } = await import('node:child_process');
      const proc = spawnSync(
        'pnpm',
        [
          'exec',
          'tsx',
          'src/visual/cli-demo.ts',
          '--url',
          DEMO_TARGET.href,
          '--rule-pack',
          'cms-healthcare',
          '--no-open',
          '--out',
          outRoot,
        ],
        {
          cwd: join(import.meta.dirname, '..'),
          encoding: 'utf8',
          env: { ...process.env, FORCE_COLOR: '0' },
        },
      );

      expect(proc.status).toBe(0);
      expect(proc.stdout).toMatch(/1 violation\(s\) found/);
      expect(proc.stdout).toMatch(/CMS-HCGOV-BANNER-001/);
      expect(proc.stdout).not.toMatch(/CMS-HCGOV-HEADER-002/);

      const reportMatch = proc.stdout.match(/Report: (.+\/index\.html)/);
      expect(reportMatch).not.toBeNull();
      const indexPath = reportMatch![1]!;
      const runDir = dirname(indexPath);
      const files = await import('node:fs/promises').then((fs) => fs.readdir(runDir));
      expect(files).toContain('index.html');
      expect(files).toContain('report.json');
      expect(files.some((f) => f.endsWith('.png'))).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );
});
