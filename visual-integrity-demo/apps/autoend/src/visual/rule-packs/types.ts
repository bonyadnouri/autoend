import type { Browser } from 'playwright';
import type { VisualRuleViolation } from '../../report/types.js';
import type { ExpectedVisualArtifact, VisualCapture } from '../types.js';

export interface RulePackContext {
  browser: Browser;
  /** Directory expected-render artifacts should be written into. */
  outputDir: string;
}

/**
 * A checkable design standard (Visual Integrity plan: App Integration >
 * Extensibility, DesignRuleOracle). New standards (DHS/USWDS, GOV.UK, GC)
 * plug in without touching capture or replay — only `analyze.ts` picks the
 * first pack whose `appliesTo` matches.
 */
export interface VisualRulePack {
  id: string;
  title: string;
  version: string;
  appliesTo(url: URL): boolean;
  /** Render/produce the reference artifacts this pack compares against (e.g. an expected header crop). */
  expectedArtifacts(capture: VisualCapture, ctx: RulePackContext): Promise<ExpectedVisualArtifact[]>;
  /** Deterministic evaluation — no model calls. `evidenceOverlayIds` starts empty; overlays.ts fills it in. */
  evaluate(capture: VisualCapture, expected: ExpectedVisualArtifact[]): Promise<VisualRuleViolation[]>;
}
