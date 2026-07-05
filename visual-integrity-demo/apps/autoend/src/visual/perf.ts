import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Performance budgets and caching (Visual Integrity plan: Lightweight
 * Execution Strategy, Anti-Bloat Rules). Budgets are advisory — exceeding one
 * logs a warning instead of failing the Run, because a slow visual pass must
 * never take down the rest of `autoend`.
 */
export const PERFORMANCE_BUDGETS_MS = {
  captureAndStabilize: 5_000,
  screenshotAndDom: 1_000,
  ruleChecks: 250,
  pixelDiff: 500,
  overlayGeneration: 500,
  reportRender: 1_000,
  tier1ModelCall: 8_000,
  tier2ModelCall: 45_000,
} as const;

export type PerfStage = keyof typeof PERFORMANCE_BUDGETS_MS;

export interface PerfTiming {
  stage: PerfStage;
  ms: number;
  overBudget: boolean;
}

/** Times one stage and records whether it exceeded its budget; never throws on its own account. */
export async function timeStage<T>(
  stage: PerfStage,
  timings: PerfTiming[],
  work: () => Promise<T>,
): Promise<T> {
  const startedMs = Date.now();
  try {
    return await work();
  } finally {
    const ms = Date.now() - startedMs;
    const budget = PERFORMANCE_BUDGETS_MS[stage];
    const overBudget = ms > budget;
    timings.push({ stage, ms, overBudget });
    if (overBudget && process.env.VISUAL_DEBUG) {
      console.warn(`[visual] "${stage}" took ${ms}ms, over its ${budget}ms budget`);
    }
  }
}

/**
 * Cache model responses by hash of `{ imageCrop, rulePackVersion, providerConfig }`
 * (Visual Integrity plan: Anti-Bloat Rules) so repeat demo runs against an
 * unchanged page/rule pack skip the network call entirely.
 */
export interface ModelCacheKeyInput {
  imageBytesHash: string;
  rulePackVersion: string;
  providerConfig: string;
}

export function modelCacheKey(input: ModelCacheKeyInput): string {
  return createHash('sha256')
    .update(input.imageBytesHash)
    .update('|')
    .update(input.rulePackVersion)
    .update('|')
    .update(input.providerConfig)
    .digest('hex');
}

export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class ModelResponseCache {
  constructor(private readonly cacheDir: string) {}

  private pathFor(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.pathFor(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(this.pathFor(key), JSON.stringify(value, null, 2));
  }
}
