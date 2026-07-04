/** Append-only run log vocabulary — wire contract for UIs and consoles. */

export type RunEvent =
  | { type: 'log'; level: 'info' | 'warn'; message: string }
  | { type: 'phase'; phase: 'replay' | 'exploration' | 'verification' | 'triage' | 'publish'; state: 'started' | 'finished' }
  | { type: 'flow'; flowId: string; title: string; state: 'started' | 'passed' | 'failed' | 'healing' | 'healed' }
  | { type: 'screen'; screenId: string; path: string; state: 'visited' | 'discovered' }
  | { type: 'explorer'; name: string; state: 'spawned' | 'reported' | 'timed-out' | 'lost' }
  | { type: 'finding'; findingId: string; kind: string; title: string };

export interface StoredRunEvent {
  runId: string;
  seq: number;
  ts: string;
  event: RunEvent;
}
