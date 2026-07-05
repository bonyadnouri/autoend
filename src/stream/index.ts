import { getSupabase, resolveAnalysisId } from '../publish/supabase-client.js';
import { CompositeReporter } from './composite-reporter.js';
import { ConsoleReporter } from './console-reporter.js';
import { NoopReporter } from './noop-reporter.js';
import { SupabaseReporter } from './supabase-reporter.js';
import type { RunReporter } from './reporter.js';

export type { RunEvent, StoredRunEvent } from './events.js';
export { screenId, screenTitle, edgeId } from './screen-id.js';
export type {
  EdgeFact,
  RunKind,
  RunReporter,
  RunStartedInfo,
  RunSummary,
  ScreenElement,
  ScreenFact,
  ScreenStatus,
  TestRunStatus,
  TestStatusFact,
} from './reporter.js';
export { NoopReporter } from './noop-reporter.js';
export { ConsoleReporter } from './console-reporter.js';
export { CompositeReporter } from './composite-reporter.js';
export { SupabaseReporter } from './supabase-reporter.js';

export interface CreateReporterOptions {
  runId: string;
  analysisId?: string;
  /** Mirror events to stdout (default true when TTY). */
  console?: boolean;
  /** Stream to Supabase when env is configured (default true). */
  supabase?: boolean;
}

/** Build the reporter stack for a run. Falls back to NoopReporter when nothing is enabled. */
export function createReporter(opts: CreateReporterOptions): RunReporter {
  const reporters: RunReporter[] = [];
  const useConsole = opts.console ?? process.stdout.isTTY;
  const useSupabase = opts.supabase ?? true;

  if (useConsole) reporters.push(new ConsoleReporter());

  if (useSupabase) {
    const client = getSupabase();
    if (client) {
      reporters.push(new SupabaseReporter(client, resolveAnalysisId({ analysisId: opts.analysisId }), opts.runId));
    }
  }

  if (reporters.length === 0) return NoopReporter;
  if (reporters.length === 1) return reporters[0]!;
  return new CompositeReporter(reporters);
}
