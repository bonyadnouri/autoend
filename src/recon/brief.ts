import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isArchetype, type MissionSpec } from '../explore/personas.js';

/**
 * The Product Brief (CONTEXT.md, ADR-0007): the Recon agent's persistent
 * understanding of the Target, built from its repo and docs — never the live
 * app. It instantiates every Persona's Missions and lives at
 * .autoend/brief.json beside the Flow Map, regenerating only when stale.
 */

export const BRIEF_SCHEMA_VERSION = 1;

export interface ProductBrief {
  schemaVersion?: number;
  generatedAt: string;
  /** Git HEAD when the brief was written; drives staleness. */
  gitHead?: string;
  /** What the product is, one paragraph. */
  product: string;
  /** Who uses it and for what. */
  users: string;
  /** The major UI surfaces worth dividing between Personas. */
  surfaces: string[];
  missions: MissionSpec[];
}

/**
 * Staleness rules (ADR-0007): a wrong cached brief misleads the whole fleet,
 * so regenerate when the codebase moved or the brief aged out. Provisional
 * until the benchmark tunes them (ADR-0009).
 */
export const BRIEF_MAX_AGE_DAYS = 14;
export const BRIEF_MAX_HEAD_DISTANCE = 25;

function briefPath(repoRoot: string): string {
  return join(repoRoot, '.autoend', 'brief.json');
}

/** Missing or corrupt brief means no brief — Recon regenerates. */
export async function loadBrief(repoRoot: string): Promise<ProductBrief | undefined> {
  try {
    const parsed = JSON.parse(await readFile(briefPath(repoRoot), 'utf8')) as ProductBrief;
    return validateBrief(parsed);
  } catch {
    return undefined;
  }
}

export async function saveBrief(repoRoot: string, brief: ProductBrief): Promise<void> {
  await mkdir(join(repoRoot, '.autoend'), { recursive: true });
  const stamped: ProductBrief = { ...brief, schemaVersion: BRIEF_SCHEMA_VERSION };
  await writeFile(briefPath(repoRoot), JSON.stringify(stamped, null, 2));
}

/**
 * Pure staleness check; callers supply the git facts. `headDistance` is the
 * commit count between the brief's HEAD and the current one — undefined when
 * unknown (no git, unreachable ref), which counts as moved only if the heads
 * differ. Exported for tests.
 */
export function isBriefStale(
  brief: ProductBrief,
  facts: { now: Date; currentHead?: string; headDistance?: number },
): boolean {
  const ageMs = facts.now.getTime() - new Date(brief.generatedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > BRIEF_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return true;
  if (brief.gitHead && facts.currentHead && brief.gitHead !== facts.currentHead) {
    if (facts.headDistance === undefined) return true; // heads differ, distance unknown — assume moved
    return facts.headDistance >= BRIEF_MAX_HEAD_DISTANCE;
  }
  return false;
}

/**
 * Validate a parsed brief into a usable one, or undefined. Missions with an
 * unknown archetype are dropped rather than failing the brief — Persona
 * assignment falls back per-archetype (personas.ts). Exported for tests.
 */
export function validateBrief(raw: unknown): ProductBrief | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const b = raw as Record<string, unknown>;
  if (typeof b.product !== 'string' || b.product.length === 0) return undefined;
  if (typeof b.generatedAt !== 'string') return undefined;
  const missions: MissionSpec[] = [];
  if (Array.isArray(b.missions)) {
    for (const m of b.missions as Array<Record<string, unknown>>) {
      if (
        typeof m?.archetype === 'string' && isArchetype(m.archetype) &&
        typeof m?.goal === 'string' && typeof m?.surface === 'string'
      ) {
        missions.push({
          archetype: m.archetype,
          goal: m.goal,
          surface: m.surface,
          hypotheses: Array.isArray(m.hypotheses)
            ? (m.hypotheses as unknown[]).filter((h): h is string => typeof h === 'string')
            : [],
        });
      }
    }
  }
  return {
    schemaVersion: typeof b.schemaVersion === 'number' ? b.schemaVersion : undefined,
    generatedAt: b.generatedAt,
    gitHead: typeof b.gitHead === 'string' ? b.gitHead : undefined,
    product: b.product,
    users: typeof b.users === 'string' ? b.users : '',
    surfaces: Array.isArray(b.surfaces)
      ? (b.surfaces as unknown[]).filter((s): s is string => typeof s === 'string')
      : [],
    missions,
  };
}
