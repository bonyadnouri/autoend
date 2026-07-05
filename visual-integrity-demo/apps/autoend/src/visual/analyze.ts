import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import type { Finding, VisualClassifierResult, VisualOverlay, VisualRuleViolation } from '../report/types.js';
import { capturePage } from './capture.js';
import { computeSpecDiff, type PixelDiffResult, type SpecDiffBand } from './diff.js';
import { buildVisualFindings } from './findings.js';
import { buildDeterministicOverlays } from './overlays.js';
import { type PerfTiming, ModelResponseCache, hashBytes, modelCacheKey, timeStage } from './perf.js';
import { providerCacheSalt, resolveProvider } from './providers.js';
import { resolveRulePack } from './rules.js';
import { RULE_EXPECTED_ARTIFACT_ID } from './rule-artifacts.js';
import type { ExpectedVisualArtifact, VisualCapture, VisualModelEffort } from './types.js';

/**
 * The single entry point the rest of the app calls (Visual Integrity plan:
 * App Integration > Module Boundaries). Replay, run.ts, the standalone CLI,
 * and tests all go through this — nobody else touches capture/, diff.ts,
 * overlays.ts, providers.ts, or rule-packs/ directly.
 */
export interface VisualIntegrityInput {
  page: Page;
  /** Used to render each rule pack's expected artifacts in a fresh, isolated context. */
  browser: Browser;
  target: URL;
  /** Directory screenshots/diffs/overlays get written into (the Run's evidence/ dir, or a standalone demo dir). */
  outputDir: string;
  /** Repo root, when available — used only to place a cross-run model-response cache. */
  repoRoot?: string;
  rulePackId?: string;
  mode?: 'off' | 'rules' | 'models';
  providerId?: 'none' | 'nvidia';
  effort?: VisualModelEffort;
  flowId?: string;
  idPrefix?: string;
  /** When set, screenshot paths in Findings are prefixed (integrated Run: `visual/`). */
  evidencePrefix?: string;
}

export interface VisualIntegrityResult {
  /** False when no rule pack applies to this URL — Failure Behavior: "do nothing". */
  applied: boolean;
  rulePackId?: string;
  capture?: VisualCapture;
  /** Split, per-violation Finding records — what replay/run.ts append to RunArtifact.findings. */
  findings: Finding[];
  /** The same violations findings[] were built from, unsplit — for consumers that want one combined report (standalone CLI). */
  violations: VisualRuleViolation[];
  overlays: VisualOverlay[];
  expected: ExpectedVisualArtifact[];
  diff?: PixelDiffResult;
  classifier?: VisualClassifierResult;
  timings: PerfTiming[];
  /** Present when a model was configured and called but failed — deterministic Findings above are still valid. */
  modelReviewError?: string;
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

function buildDiffBands(violations: VisualRuleViolation[], expected: ExpectedVisualArtifact[]): SpecDiffBand[] {
  const bands: SpecDiffBand[] = [];
  for (const violation of violations) {
    const expectedId = RULE_EXPECTED_ARTIFACT_ID[violation.ruleId];
    const artifact = expectedId ? expected.find((a) => a.id === expectedId) : undefined;
    if (artifact) bands.push({ label: artifact.label, y: artifact.box.y, height: artifact.box.height });
  }
  return bands;
}

export async function analyzeVisualIntegrity(input: VisualIntegrityInput): Promise<VisualIntegrityResult> {
  const mode = input.mode ?? envMode();
  const timings: PerfTiming[] = [];
  if (mode === 'off') return { applied: false, findings: [], violations: [], overlays: [], expected: [], timings };

  const rulePack = resolveRulePack(input.target, input.rulePackId);
  if (!rulePack) return { applied: false, findings: [], violations: [], overlays: [], expected: [], timings }; // no pack applies: do nothing

  let capture: VisualCapture;
  try {
    capture = await capturePage({ page: input.page, target: input.target, outputDir: input.outputDir, timings });
  } catch (error) {
    if (process.env.VISUAL_DEBUG) {
      console.warn(`[visual] capture failed, skipping visual check: ${error instanceof Error ? error.message : error}`);
    }
    return { applied: true, rulePackId: rulePack.id, findings: [], violations: [], overlays: [], expected: [], timings };
  }

  const expected = await (async () => {
    try {
      return await rulePack.expectedArtifacts(capture, { browser: input.browser, outputDir: input.outputDir });
    } catch (error) {
      if (process.env.VISUAL_DEBUG) {
        console.warn(`[visual] expected-artifact rendering failed: ${error instanceof Error ? error.message : error}`);
      }
      return [];
    }
  })();

  let violations: VisualRuleViolation[] = [];
  try {
    violations = await timeStage('ruleChecks', timings, () => rulePack.evaluate(capture, expected));
  } catch (error) {
    if (process.env.VISUAL_DEBUG) {
      console.warn(`[visual] rule evaluation failed: ${error instanceof Error ? error.message : error}`);
    }
    return { applied: true, rulePackId: rulePack.id, capture, findings: [], violations: [], overlays: [], expected, timings };
  }
  if (violations.length === 0) {
    return { applied: true, rulePackId: rulePack.id, capture, findings: [], violations: [], overlays: [], expected, timings };
  }

  const expectedHeaderArtifact = expected[0];
  let diffResult: PixelDiffResult | undefined;
  if (expectedHeaderArtifact) {
    try {
      diffResult = await computeSpecDiff(
        join(capture.outputDir, capture.topRegionFile),
        join(capture.outputDir, expectedHeaderArtifact.file),
        buildDiffBands(violations, expected),
        capture.outputDir,
        timings,
      );
    } catch (error) {
      if (process.env.VISUAL_DEBUG) {
        console.warn(`[visual] pixel diff failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  const overlays = await timeStage('overlayGeneration', timings, async () =>
    buildDeterministicOverlays({
      capture,
      expected,
      diffRegions: diffResult?.regions ?? [],
      violations,
    }),
  );

  const effort = input.effort ?? envEffort();
  const providerId = input.providerId ?? envProviderId();
  let mergedOverlays = overlays;
  let classifier: VisualClassifierResult | undefined;
  let modelReviewError: string | undefined;

  if (mode === 'models' && effort !== 'off') {
    const provider = resolveProvider(providerId, effort);
    if (provider?.detectRegions && process.env.NVIDIA_OBJECT_DETECTION_URL) {
      try {
        const modelOverlays = await timeStage('tier1ModelCall', timings, () =>
          provider.detectRegions!({
            imageFile: join(capture.outputDir, capture.topRegionFile),
            label: 'top region',
          }),
        );
        mergedOverlays = [...mergedOverlays, ...modelOverlays];
      } catch (error) {
        if (process.env.VISUAL_DEBUG) {
          console.warn(
            `[visual] object detection unavailable: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
    if (provider?.reviewViolation) {
      try {
        const cacheDir = input.repoRoot
          ? join(input.repoRoot, '.visual-integrity', 'cache')
          : join(input.outputDir, '.visual-cache');
        const cache = new ModelResponseCache(cacheDir);
        const actualBytes = await readFile(join(capture.outputDir, capture.topRegionFile));
        const modelName = process.env.NVIDIA_NEMOTRON_MODEL ?? 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
        const key = modelCacheKey({
          imageBytesHash: hashBytes(actualBytes),
          rulePackVersion: `${rulePack.id}@${rulePack.version}`,
          providerConfig: `${provider.id}:${effort}:${modelName}:${providerCacheSalt()}`,
        });
        const cached = await cache.get<VisualClassifierResult>(key);
        if (cached) {
          classifier = cached;
        } else {
          classifier = await timeStage(effort === 'deep' ? 'tier2ModelCall' : 'tier1ModelCall', timings, () =>
            provider.reviewViolation!({
              actualImageFile: join(capture.outputDir, capture.topRegionFile),
              expectedImageFile: expectedHeaderArtifact ? join(capture.outputDir, expectedHeaderArtifact.file) : undefined,
              domText: capture.visibleText,
              violations,
              deterministicOverlays: overlays,
            }),
          );
          await cache.set(key, classifier);
        }
      } catch (error) {
        // Failure Behavior: model provider failing must not drop the deterministic Findings.
        modelReviewError = error instanceof Error ? error.message : String(error);
        if (process.env.VISUAL_DEBUG) console.warn(`[visual] model review unavailable: ${modelReviewError}`);
      }
    }
  }

  const findings = buildVisualFindings({
    capture,
    violations,
    overlays: mergedOverlays,
    diffFile: diffResult?.diffFile,
    changedPixels: diffResult?.changedPixels,
    changedRatio: diffResult?.changedRatio,
    threshold: 0.15,
    classifier,
    flowId: input.flowId,
    idPrefix: input.idPrefix,
    evidencePrefix: input.evidencePrefix,
    expectedFile: expectedHeaderArtifact?.file,
  });

  return {
    applied: true,
    rulePackId: rulePack.id,
    capture,
    findings,
    violations,
    overlays: mergedOverlays,
    expected,
    diff: diffResult,
    classifier,
    timings,
    modelReviewError,
  };
}
