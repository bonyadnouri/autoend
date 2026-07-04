import type { FlowRunOutcome } from './flow-map.js';

/**
 * Whether a Flow's replay history shows mixed pass/fail outcomes — a flakiness
 * signal built from `recentRuns` (issue #14). Pure and unit-testable.
 *
 * Checked against history *before* the current outcome is appended: a flow that
 * only ever passed and fails for the first time is a Regression; one that has
 * both passed and failed in prior runs and fails again is treated as flaky.
 */
export function isFlaky(history: FlowRunOutcome[] | undefined): boolean {
  if (!history?.length) return false;
  const sawPass = history.some((r) => r.passed);
  const sawFail = history.some((r) => !r.passed);
  return sawPass && sawFail;
}

/** Human-readable summary of recent outcomes for a Finding detail line. */
export function formatRunHistory(history: FlowRunOutcome[] | undefined): string {
  if (!history?.length) return 'no prior replay history';
  return history.map((r) => (r.passed ? 'pass' : 'fail')).join(' → ');
}
