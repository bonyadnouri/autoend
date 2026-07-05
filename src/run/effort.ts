/**
 * Effort — the user-chosen depth preset for a Run (CONTEXT.md).
 * Effort bounds exploration only: replaying the whole Flow Map always
 * completes at any Effort, so Regression claims are never sacrificed.
 *
 * From high upward, Effort selects the exploration pipeline's SHAPE, not just
 * its duration (ADR-0007): low/mid keep the fast single-pass smoke run; high
 * and above run Recon → persona Waves → Verifier → Triage.
 */
export const EFFORT_LEVELS = ['low', 'mid', 'high', 'xhigh', 'ultra'] as const;

export type Effort = (typeof EFFORT_LEVELS)[number];

export interface ExplorationBudget {
  /** Wall-clock cap for one explorer, in seconds. */
  seconds: number;
  /** Maximum concurrently exploring agents (per Wave on the deep path). */
  explorers: number;
}

export interface PipelineShape extends ExplorationBudget {
  /** 'smoke' = today's single-pass explorers; 'deep' = the staged pipeline (ADR-0007). */
  kind: 'smoke' | 'deep';
  /** Spawning generations; Wave two is lead-seeded (CONTEXT.md: Wave). */
  waves: 1 | 2;
  /** Deep stages. Recon/Verifier/Triage only ever run on the deep path. */
  recon: boolean;
  verifier: boolean;
  triage: boolean;
}

/**
 * Per-stage budgets are provisional until the benchmark tunes them
 * (ADR-0009: baseline before bars). Smoke numbers carry over live-run data
 * (2026-07-04): one agent turn costs 5-15s of LLM latency and ≈ 21.5k input
 * tokens; sub-45s soft budgets starve explorers before they can report.
 */
export const EFFORT_PIPELINES: Record<Effort, PipelineShape> = {
  low: { kind: 'smoke', explorers: 2, waves: 1, seconds: 45, recon: false, verifier: false, triage: false },
  mid: { kind: 'smoke', explorers: 3, waves: 1, seconds: 240, recon: false, verifier: false, triage: false },
  // 5 explorers at high: one per archetype, so no persona axis (and none of
  // Recon's Missions for it) is structurally dropped at the entry deep tier.
  high: { kind: 'deep', explorers: 5, waves: 1, seconds: 480, recon: true, verifier: true, triage: true },
  xhigh: { kind: 'deep', explorers: 6, waves: 2, seconds: 600, recon: true, verifier: true, triage: true },
  ultra: { kind: 'deep', explorers: 8, waves: 2, seconds: 900, recon: true, verifier: true, triage: true },
};

export function isEffort(value: string): value is Effort {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}
