import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Finding } from '../report/types.js';
import { analyzeVisualIntegrity } from './analyze.js';
import { isVisualExcepted, readVisualExceptions } from './exceptions.js';
import { buildStandaloneReport } from './standalone-report.js';
import { renderStandaloneViewerHtml } from './standalone-viewer.js';
import { listRulePacks } from './rules.js';
import type { VisualModelEffort } from './types.js';

export interface RunVisualCheckOptions {
  target: URL;
  repoRoot: string;
  /** Run evidence directory — visual artifacts land in `<evidenceDir>/visual/`. */
  evidenceDir: string;
  runId: string;
}

function envMode(): 'off' | 'rules' | 'models' {
  const raw = process.env.VISUAL_INTEGRITY;
  return raw === 'rules' || raw === 'models' ? raw : 'off';
}

function envProviderId(): 'none' | 'nvidia' {
  return process.env.VISUAL_MODEL_PROVIDER === 'nvidia' ? 'nvidia' : 'none';
}

function envEffort(): VisualModelEffort {
  const raw = process.env.VISUAL_MODEL_EFFORT;
  return raw === 'fast' || raw === 'deep' ? raw : 'off';
}

/**
 * Integrated-mode visual check (Visual Integrity plan: App Integration).
 * Called from executeRun when VISUAL_INTEGRITY is rules|models. Never throws —
 * failures degrade to zero Findings so the main Run still completes.
 */
export async function runTargetVisualCheck(opts: RunVisualCheckOptions): Promise<Finding[]> {
  const mode = envMode();
  if (mode === 'off') return [];

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const outputDir = join(opts.evidenceDir, 'visual');
    await mkdir(outputDir, { recursive: true });

    const providerId = envProviderId();
    const effort = envEffort();
    const effectiveMode = mode;

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    try {
      const result = await analyzeVisualIntegrity({
        page,
        browser,
        target: opts.target,
        outputDir,
        repoRoot: opts.repoRoot,
        mode: effectiveMode,
        providerId,
        effort,
        idPrefix: 'visual-run',
        evidencePrefix: 'visual/',
      });

      if (!result.applied || !result.capture) {
        const exceptions = await readVisualExceptions(opts.repoRoot);
        const host = opts.target.host;
        return result.findings.filter((f) => {
          const ruleId = f.visual?.violations?.[0]?.ruleId;
          return !ruleId || !isVisualExcepted(exceptions, ruleId, host);
        });
      }

      const report = buildStandaloneReport({
        runId: opts.runId,
        target: opts.target.href,
        rulePackId: result.rulePackId ?? 'auto',
        rulePackTitle: listRulePacks().find((p) => p.id === result.rulePackId)?.title ?? result.rulePackId ?? 'Unknown',
        capture: result.capture,
        expected: result.expected,
        overlays: result.overlays,
        violations: result.violations,
        diffFile: result.diff?.diffFile,
        changedPixels: result.diff?.changedPixels,
        changedRatio: result.diff?.changedRatio,
        classifier: result.classifier,
        modelReviewError: result.modelReviewError,
        timings: result.timings,
      });

      await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
      await writeFile(join(outputDir, 'index.html'), renderStandaloneViewerHtml(report));

      const exceptions = await readVisualExceptions(opts.repoRoot);
      const host = opts.target.host;
      return result.findings.filter((f) => {
        const ruleId = f.visual?.violations?.[0]?.ruleId;
        return !ruleId || !isVisualExcepted(exceptions, ruleId, host);
      });
    } finally {
      await context.close();
    }
  } catch (error) {
    if (process.env.VISUAL_DEBUG) {
      console.warn(`[visual] integrated check failed: ${error instanceof Error ? error.message : error}`);
    }
    return [];
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
