import type { ConsoleEntry, NetworkEntry, StepResult } from '../report/types.js';
import type { RunEvent } from './events.js';

export type RunKind = 'full' | 'single-test';
export type ScreenStatus = 'running' | 'passed' | 'failed' | 'discovered';
export type TestRunStatus = 'running' | 'passed' | 'failed' | 'healed' | 'discovered';

export interface RunSummary {
  runId: string;
  status: 'finished' | 'failed';
  error?: string;
  flowsReplayed?: number;
  flowsDiscovered?: number;
  findingCounts?: Record<string, number>;
}

export interface ScreenFact {
  id: string;
  path: string;
  title?: string;
  status: ScreenStatus;
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
  edgeSeen(edge: EdgeFact): Promise<void>;
  testStatus(update: TestStatusFact): Promise<void>;
}
