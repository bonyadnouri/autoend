import type { ConsoleEntry, NetworkEntry, StepResult } from '../report/types.js';
import type { RunEvent } from './events.js';

export type RunKind = 'full' | 'single-test';
export type ScreenStatus = 'running' | 'passed' | 'failed' | 'discovered' | 'warning';
export type TestRunStatus = 'running' | 'passed' | 'failed' | 'healed' | 'discovered';

export interface RunSummary {
  runId: string;
  status: 'finished' | 'failed';
  error?: string;
  flowsReplayed?: number;
  flowsDiscovered?: number;
  findingCounts?: Record<string, number>;
}

/** One interactive control on a screen — mirrors Lumen's InteractiveElement. */
export interface ScreenElement {
  id: string;
  label: string;
  type: string;
  description: string;
}

/** A link/control that leads elsewhere — mirrors Lumen's NavigationOption. */
export interface ScreenNavOption {
  label: string;
  targetScreenId: string;
  trigger: string;
}

export interface ScreenFact {
  id: string;
  path: string;
  title?: string;
  /**
   * Runtime status of the screen. Optional: an enrichment fact (elements/nav
   * captured by an explorer) omits it so it never downgrades a status a flow
   * already settled (e.g. a replay 'failed').
   */
  status?: ScreenStatus;
  /** Interactive controls captured on this screen (enrichment). */
  elements?: ScreenElement[];
  /** Navigation options captured on this screen (enrichment). */
  navigation?: ScreenNavOption[];
  /** Human-readable expected actions derived from the elements (enrichment). */
  expectedActions?: string[];
  /**
   * When true, only update an existing screen row — never insert a new one.
   * Explorer-reported screens use this so an agent can't conjure a screen node
   * for a path no verified flow actually navigated to (e.g. a guessed/404 route).
   */
  enrichOnly?: boolean;
}

export interface EdgeFact {
  id: string;
  source: string;
  target: string;
  label: string;
  status?: 'normal' | 'warning' | 'broken';
}

export interface TestStatusFact {
  testId: string;
  title: string;
  status: TestRunStatus;
  detail?: string;
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  timeline?: StepResult[];
  durationMs?: number;
  /**
   * The flow's executable Playwright script. Streamed WITH the status so the
   * test row is replayable the moment it exists: the daemon hydrates its flow
   * map from `tests.script`, and a full run wipes the previous rows up front —
   * if the script only arrived at publish (as it used to), any run that died
   * before publishing left the whole project's flow map script-less, and every
   * later run silently replayed nothing.
   */
  script?: string;
}

export interface RunStartedInfo {
  runId: string;
  target: string;
  effort: string;
  kind: RunKind;
}

/** Observer seam between the run pipeline and any sink (Supabase, stdout, noop). */
export interface RunReporter {
  runStarted(info: RunStartedInfo): Promise<void>;
  runFinished(summary: RunSummary): Promise<void>;
  event(event: RunEvent): Promise<void>;
  screenSeen(screen: ScreenFact): Promise<void>;
  /**
   * Remove a screen (and its edges) that turned out not to be a real page — a
   * navigation whose top-level document responded HTTP >= 400. 404 destinations
   * must never persist as graph nodes; they surface as warning findings instead.
   */
  screenDropped(id: string): Promise<void>;
  edgeSeen(edge: EdgeFact): Promise<void>;
  testStatus(update: TestStatusFact): Promise<void>;
  /** Wait until all queued Supabase writes have finished. Call before publish. */
  flush(): Promise<void>;
}
