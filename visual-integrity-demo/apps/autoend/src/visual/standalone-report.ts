import type { VisualClassifierResult, VisualOverlay, VisualRuleViolation } from '../report/types.js';
import { TOP_REGION_HEIGHT } from './capture.js';
import type { PerfTiming } from './perf.js';
import type { ExpectedVisualArtifact, VisualCapture } from './types.js';

/**
 * Standalone artifact schema (Visual Integrity plan: Standalone Mode >
 * Standalone Artifact). Deliberately mirrors `Finding.visual` field names so
 * this can later be imported into the integrated Report viewer without a
 * migration — only the wrapper (runId/target/rulePack) differs.
 */
export interface StandaloneVisualReport {
  runId: string;
  target: string;
  rulePackId: string;
  rulePackTitle: string;
  capturedAt: string;
  viewport: string;
  /** Capture viewport width in px (image-space x axis for overlay coords). */
  viewportWidth: number;
  actualFile: string;
  topRegionFile: string;
  /** Pixel height of `topRegionFile` — lets the viewer set a stable aspect-ratio with no layout shift. */
  topRegionHeight: number;
  expectedFile?: string;
  /** Pixel height of the rendered expected chrome band (USA banner + header), used for the hero compare crop. */
  expectedBandHeight: number;
  expectedArtifacts: ExpectedVisualArtifact[];
  diffFile?: string;
  changedPixels?: number;
  changedRatio?: number;
  overlays: VisualOverlay[];
  violations: VisualRuleViolation[];
  classifier?: VisualClassifierResult;
  modelReviewError?: string;
  timings: PerfTiming[];
}

export interface BuildStandaloneReportInput {
  runId: string;
  target: string;
  rulePackId: string;
  rulePackTitle: string;
  capture: VisualCapture;
  expected: ExpectedVisualArtifact[];
  overlays: VisualOverlay[];
  violations: VisualRuleViolation[];
  diffFile?: string;
  changedPixels?: number;
  changedRatio?: number;
  classifier?: VisualClassifierResult;
  modelReviewError?: string;
  timings: PerfTiming[];
}

export function buildStandaloneReport(input: BuildStandaloneReportInput): StandaloneVisualReport {
  const expectedBandHeight = input.expected.reduce(
    (max, artifact) => Math.max(max, artifact.box.y + artifact.box.height),
    0,
  );
  return {
    runId: input.runId,
    target: input.target,
    rulePackId: input.rulePackId,
    rulePackTitle: input.rulePackTitle,
    capturedAt: input.capture.capturedAt,
    viewport: `${input.capture.viewport.width}x${input.capture.viewport.height}`,
    viewportWidth: input.capture.viewport.width,
    actualFile: input.capture.screenshotFile,
    topRegionFile: input.capture.topRegionFile,
    topRegionHeight: Math.min(TOP_REGION_HEIGHT, input.capture.viewport.height),
    expectedFile: input.expected[0]?.file,
    expectedBandHeight: expectedBandHeight > 0 ? expectedBandHeight : 136,
    expectedArtifacts: input.expected,
    diffFile: input.diffFile,
    changedPixels: input.changedPixels,
    changedRatio: input.changedRatio,
    overlays: input.overlays,
    violations: input.violations,
    classifier: input.classifier,
    modelReviewError: input.modelReviewError,
    timings: input.timings,
  };
}
