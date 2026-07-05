// Mirror of src/report/types.ts — keep in sync; the root file is authoritative.

/** Effort — the user-chosen depth preset for a Run (CONTEXT.md). */
type Effort = 'low' | 'mid' | 'high' | 'xhigh' | 'ultra';

/** The three Finding tiers (CONTEXT.md: Finding). */
export type FindingKind = 'hard-failure' | 'regression' | 'advisory';

/** Where a Finding's fault lives (CONTEXT.md: Diagnosis). A wrong Flow script is 'flow', never 'test'. */
export type FaultDomain = 'app' | 'flow' | 'environment';

/** CONTEXT.md: Diagnosis — the filing agent's judgment. Producers land per ADR-0006; schema-only for now. */
export interface Diagnosis {
  rootCause: string;
  faultDomain: FaultDomain;
  /** 0–100. */
  confidence: number;
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

/** Where a VisualOverlay's box/mask/label came from (Visual Integrity plan: VisualOverlay). */
export type VisualOverlaySource = 'pixel-diff' | 'dom-geometry' | 'design-contract' | 'model';

/**
 * One drawable annotation in the Report viewer's visual panel — a bounding
 * box, a synthetic mask, or a model-proposed region. Deterministic and
 * model-sourced overlays share this shape so the viewer never needs to know
 * which tier produced them (Visual Integrity plan: Model Stack).
 */
export interface VisualOverlay {
  id: string;
  source: VisualOverlaySource;
  label: string;
  /** 0–1; omitted for deterministic (rule/DOM/pixel) overlays, which are certain by construction. */
  confidence?: number;
  /** Pixel-space box within the referenced image (see VisualComparison.viewport). */
  box?: { x: number; y: number; width: number; height: number };
  /** Filename within evidence/ for a synthetic segmentation-style mask, if generated. */
  maskFile?: string;
  severity?: 'low' | 'medium' | 'high';
  rationale?: string;
}

/** A design standard a VisualRulePack can check against (Visual Integrity plan: DesignRuleOracle). */
export type VisualStandard = 'CMS-HCGOV' | 'DHS-USWDS' | 'USWDS' | 'GOVUK' | 'GC' | 'custom';

/**
 * One violated, citable design rule — the "violation-first" unit of the
 * Visual Integrity feature. A visual Finding must name the rule it broke,
 * not just show a pixel diff (Visual Integrity plan: Violation-First Goal).
 */
export interface VisualRuleViolation {
  ruleId: string;
  standard: VisualStandard;
  title: string;
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high';
  /** VisualOverlay.id values that visually substantiate this violation. */
  evidenceOverlayIds: string[];
  sourceUrl?: string;
}

/** Where the "expected" side of a visual comparison came from. */
export interface DesignSource {
  kind: 'rule-pack' | 'baseline-screenshot' | 'design-tokens';
  id: string;
  version?: string;
}

/** A named page region a diff/overlay pass identified (e.g. "hero", "top-banner"). */
export interface VisualRegion {
  label: string;
  box: { x: number; y: number; width: number; height: number };
  changedRatio?: number;
}

/** Advisory-only judgment from an optional multimodal reviewer (Tier 2). Never the source of truth. */
export interface VisualClassifierResult {
  classification: 'rule-violation' | 'likely-intentional' | 'likely-regression' | 'needs-human';
  /** 0–100, matching Diagnosis.confidence. */
  confidence: number;
  summary: string;
  ruleIds?: string[];
  rationale?: string;
  recommendedFix?: string;
  /** Provider identifier, e.g. "nvidia:nemotron-3-nano-omni". Absent when no model ran. */
  provider?: string;
}

/**
 * Visual comparison metadata attached to a Finding (Visual Integrity plan:
 * Data Model Additions). All file fields are filenames within the artifact's
 * evidence/ dir, matching Screenshot/evidence conventions.
 */
export interface VisualComparison {
  /** Filename of a prior/expected-render screenshot, when one exists. */
  baselineFile?: string;
  /** Filename of the design-spec expected render (rule-pack), when one exists. */
  expectedFile?: string;
  actualFile: string;
  /** Pixel-diff or heatmap image, when a comparison baseline exists. */
  diffFile?: string;
  /** e.g. "1280x720". */
  viewport: string;
  /** Pixel-diff threshold ratio (0–1) that was used to decide whether this comparison is a Finding. */
  threshold: number;
  changedPixels?: number;
  changedRatio?: number;
  regions?: VisualRegion[];
  designSource?: DesignSource;
  classifier?: VisualClassifierResult;
  overlays?: VisualOverlay[];
  violations?: VisualRuleViolation[];
}

export interface Finding {
  id: string;
  kind: FindingKind;
  /** The Flow this Finding is attached to; Regressions always have one. */
  flowId?: string;
  title: string;
  detail: string;
  /** Path to WebM Evidence, relative to the Run artifact's evidence/ dir. */
  evidence?: string;
  diagnosis?: Diagnosis;
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  timeline?: StepResult[];
  screenshots?: Screenshot[];
  /** Visual Integrity plan: present only for visual regression/advisory Findings. */
  visual?: VisualComparison;
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
}

export interface Environment {
  browser: string;
  viewport: string;
  os: string;
  node: string;
  autoendVersion: string;
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
