/**
 * Programmatic entry point for embedding autoend (CI, cron, other UIs). The CLI
 * (bin: autoend → dist/cli.js) remains the primary interface; importing this
 * module must never execute a run on its own.
 */
export { executeRun, type RunOptions, type RunOutcome } from './run/run.js';
export {
  createReporter,
  CompositeReporter,
  ConsoleReporter,
  NoopReporter,
  SupabaseReporter,
  type RunReporter,
  type RunEvent,
  type RunKind,
  type RunSummary,
  type ScreenFact,
  type EdgeFact,
  type TestStatusFact,
} from './stream/index.js';
