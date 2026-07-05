/**
 * Effort — the user-chosen depth preset for a Run (CONTEXT.md).
 * Effort bounds exploration only: replaying the whole Flow Map always
 * completes at any Effort, so Regression claims are never sacrificed.
 */
export const EFFORT_LEVELS = ['low', 'mid', 'high', 'xhigh', 'ultra'] as const;

export type Effort = (typeof EFFORT_LEVELS)[number];

export interface ExplorationBudget {
  /** Wall-clock cap for the exploration phase, in seconds. */
  seconds: number;
  /** Maximum concurrently exploring agents. */
  explorers: number;
}

/**
 * Replay stays under a few seconds; exploration is what these budgets
 * time-box. Live-run data (2026-07-04): one agent turn costs 5-15s of LLM
 * latency and ≈ 21.5k input tokens; a useful exploration needs 4-8 turns, so
 * sub-45s soft budgets starve explorers before they can report.
 */
export const EFFORT_BUDGETS: Record<Effort, ExplorationBudget> = {
  low: { seconds: 45, explorers: 2 },
  mid: { seconds: 90, explorers: 3 },
  high: { seconds: 240, explorers: 4 },
  xhigh: { seconds: 600, explorers: 8 },
  ultra: { seconds: 1800, explorers: 12 },
};

export function isEffort(value: string): value is Effort {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}
