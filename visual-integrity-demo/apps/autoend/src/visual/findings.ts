import type { Finding, VisualClassifierResult, VisualComparison, VisualOverlay, VisualRuleViolation } from '../report/types.js';
import type { VisualCapture } from './types.js';

/**
 * Converts visual rule violations into normal `Finding` records (Visual
 * Integrity plan: App Integration > "Do not create a second report format").
 * A visual regression is still just a Flow/page that changed unexpectedly —
 * it rides the existing Finding/Dismiss/Suppress machinery via `finding.visual`.
 */
export interface BuildVisualFindingsInput {
  capture: VisualCapture;
  violations: VisualRuleViolation[];
  overlays: VisualOverlay[];
  diffFile?: string;
  changedPixels?: number;
  changedRatio?: number;
  threshold: number;
  classifier?: VisualClassifierResult;
  flowId?: string;
  /** Prefix for deterministic, human-legible Finding ids across runs of the same rule pack. */
  idPrefix?: string;
  /** Prefix for screenshot/diff paths inside the Run evidence directory (e.g. `visual/`). */
  evidencePrefix?: string;
  /** Expected render filename within capture outputDir (before evidencePrefix). */
  expectedFile?: string;
}

function severityRank(severity: VisualRuleViolation['severity']): number {
  return severity === 'high' ? 2 : severity === 'medium' ? 1 : 0;
}

export function buildVisualFindings(input: BuildVisualFindingsInput): Finding[] {
  if (input.violations.length === 0) return [];

  const prefix = input.evidencePrefix ?? '';
  const worst = [...input.violations].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  const idPrefix = input.idPrefix ?? 'visual';

  return input.violations.map((violation) => {
    const relatedOverlays = input.overlays.filter((o) => violation.evidenceOverlayIds.includes(o.id));
    const comparison: VisualComparison = {
      actualFile: `${prefix}${input.capture.screenshotFile}`,
      expectedFile: input.expectedFile ? `${prefix}${input.expectedFile}` : undefined,
      diffFile: input.diffFile ? `${prefix}${input.diffFile}` : undefined,
      viewport: `${input.capture.viewport.width}x${input.capture.viewport.height}`,
      threshold: input.threshold,
      changedPixels: input.changedPixels,
      changedRatio: input.changedRatio,
      designSource: { kind: 'rule-pack', id: violation.standard },
      overlays: relatedOverlays.length > 0 ? relatedOverlays : undefined,
      violations: [violation],
      classifier: violation === worst ? input.classifier : undefined,
    };

    const kind: Finding['kind'] = violation.severity === 'low' ? 'advisory' : 'regression';

    return {
      id: `${idPrefix}-${violation.ruleId.toLowerCase()}`,
      kind,
      flowId: input.flowId,
      title: violation.title,
      detail: `Expected: ${violation.expected} Actual: ${violation.actual}`,
      screenshots: [{ file: `${prefix}${input.capture.screenshotFile}`, label: 'at-failure', tMs: 0 }],
      diagnosis: violation === worst && input.classifier
        ? {
            rootCause: input.classifier.summary,
            faultDomain: 'app',
            confidence: input.classifier.confidence,
          }
        : undefined,
      visual: comparison,
    };
  });
}
