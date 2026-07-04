import type { Effort } from '../run/effort.js';

/**
 * Data model for a Run's Report. Mirrors CONTEXT.md — the glossary is
 * authoritative; if a name here drifts from the glossary, the glossary wins.
 */

/** The three Finding tiers (CONTEXT.md: Finding). */
export type FindingKind = 'hard-failure' | 'regression' | 'advisory';

export interface Finding {
  id: string;
  kind: FindingKind;
  /** The Flow this Finding is attached to; Regressions always have one. */
  flowId?: string;
  title: string;
  detail: string;
  /** Path to WebM Evidence, relative to the Run artifact's evidence/ dir. */
  evidence?: string;
}

/** A Heal is reported alongside Findings but is not one (CONTEXT.md: Heal). */
export interface Heal {
  flowId: string;
  summary: string;
  evidence?: string;
}

/**
 * The self-contained record of one Run (ADR-0004): serialized as report.json
 * next to an evidence/ dir of WebM files. Portable — viewable anywhere;
 * resolution actions only work where the Flow Map lives.
 */
export interface RunArtifact {
  runId: string;
  target: string;
  effort: Effort;
  startedAt: string;
  finishedAt?: string;
  flowsReplayed: number;
  flowsDiscovered: number;
  findings: Finding[];
  heals: Heal[];
}
