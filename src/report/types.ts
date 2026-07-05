import type { Effort } from '../run/effort.js';

/**
 * Data model for a Run's Report. Mirrors CONTEXT.md — the glossary is
 * authoritative; if a name here drifts from the glossary, the glossary wins.
 */

/** The four Finding tiers (CONTEXT.md: Finding). A 'defect' is a reproduced semantic bug (ADR-0008). */
export type FindingKind = 'hard-failure' | 'defect' | 'regression' | 'advisory';

/** Where a Finding's fault lives (CONTEXT.md: Diagnosis). A wrong Flow script is 'flow', never 'test'. */
export type FaultDomain = 'app' | 'flow' | 'environment';

/** CONTEXT.md: Disposition — Triage's history-informed verdict. Annotates only; never dismisses (ADR-0008). */
export type DispositionVerdict = 'bug' | 'intended-change' | 'known-issue' | 'unclear';

/** A receipt behind a Disposition: the commit, PR, or issue Triage found. */
export interface Citation {
  kind: 'commit' | 'pr' | 'issue';
  /** Commit SHA, PR number/URL, or issue number/URL. */
  ref: string;
  note?: string;
}

export interface Disposition {
  verdict: DispositionVerdict;
  citations: Citation[];
  rationale: string;
  /** 0–100. */
  confidence: number;
}

/** CONTEXT.md: Diagnosis — the filing agent's judgment. Producers land per ADR-0006; schema-only for now. */
export interface Diagnosis {
  rootCause: string;
  faultDomain: FaultDomain;
  /** 0–100. */
  confidence: number;
  /** Written by the Triage agent at deep Efforts (ADR-0008). */
  disposition?: Disposition;
}

export interface ConsoleEntry {
  level: 'error' | 'warning';
  text: string;
  /** Milliseconds since the Flow's execution started. */
  tMs: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  /** HTTP status; 0 = request failed/aborted before a response. */
  status: number;
  tMs: number;
}

export interface StepResult {
  /** Navigation milestone or terminal outcome, e.g. "goto /pricing". */
  label: string;
  status: 'passed' | 'failed';
  tMs: number;
}

export interface Screenshot {
  /** Filename within the artifact's evidence/ dir. */
  file: string;
  label: 'before' | 'after' | 'at-failure';
  tMs: number;
}

export type Resolution = 'dismissed' | 'rejected' | 'suppressed';

export interface Finding {
  id: string;
  kind: FindingKind;
  /** The Flow this Finding is attached to; Regressions always have one. */
  flowId?: string;
  title: string;
  detail: string;
  /** Path to WebM Evidence, relative to the Run artifact's evidence/ dir. */
  evidence?: string;
  /** Defects only: the expectation the app violated and where it came from (ADR-0008). */
  expectation?: { statement: string; source: 'docs' | 'brief' | 'common-sense' };
  diagnosis?: Diagnosis;
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  timeline?: StepResult[];
  screenshots?: Screenshot[];
  /** Written by the viewer server when the user resolves the Finding. */
  resolution?: Resolution;
}

/** A Heal is reported alongside Findings but is not one (CONTEXT.md: Heal). */
export interface Heal {
  flowId: string;
  summary: string;
  evidence?: string;
}

/** One Flow as this Run touched it — the Report's receipts (CONTEXT.md: Report). */
export interface FlowSnapshot {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'discovered';
  discoveredAt: string;
  lastPassedAt?: string;
  timeline?: StepResult[];
  evidence?: string;
  durationMs?: number;
  /** The executable Playwright flow script — the concrete, portable reproduction. */
  script?: string;
}

export interface Environment {
  browser: string;
  viewport: string;
  os: string;
  node: string;
  autoendVersion: string;
  /** Model id every agent role ran on (ADR-0009 attribution); absent when exploration was skipped. */
  model?: string;
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
  flows: FlowSnapshot[];
  environment: Environment;
  findings: Finding[];
  heals: Heal[];
}
