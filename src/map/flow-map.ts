import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The Flow Map (CONTEXT.md): the persistent record of every Flow agents have
 * discovered and successfully executed. Committed to the user's repo like a
 * lockfile — a branch carries its own baseline (ADR-0001).
 *
 * Layout: .autoend/flows/<flowId>/flow.json (metadata, this shape)
 *         .autoend/flows/<flowId>/flow.mts (the Playwright script, ADR-0002)
 *
 * .mts, deliberately: it is unambiguously ESM no matter what "type" the
 * consuming repo's package.json declares, and it dodges test-runner globs
 * (vitest/jest match *.spec.* / *.test.* by default).
 */

/** Bump when the persisted shape of flow.json changes; enables migrations. */
export const FLOW_SCHEMA_VERSION = 1;

/**
 * The script a Flow had *before* its most recent Heal, retained so a Reject
 * (CONTEXT.md) can revert the Heal and refile the Flow as a Regression. A Heal
 * overwrites flow.mts in place, so without this the pre-heal version would
 * survive only in git history — unreachable from the Report.
 */
export interface HealRecord {
  /** flow.mts exactly as it was immediately before the Heal. */
  previousScript: string;
  /** ISO timestamp of the Heal. */
  healedAt: string;
  /** The Run that produced the Heal, if known. */
  healedInRun?: string;
}

export interface FlowMeta {
  /** Schema version of this flow.json (absent = pre-versioning, treat as 1). */
  schemaVersion?: number;
  id: string;
  title: string;
  discoveredAt: string;
  lastPassedAt?: string;
  /** Fingerprints of Suppressed Advisories attached to this Flow. */
  suppressedAdvisories?: string[];
  /** Present iff the Flow's script was Healed; consumed by Reject. */
  heal?: HealRecord;
}

export function flowMapDir(repoRoot: string): string {
  return join(repoRoot, '.autoend', 'flows');
}

function flowDir(repoRoot: string, id: string): string {
  return join(flowMapDir(repoRoot), id);
}

/**
 * Read every Flow's metadata. A single malformed or incomplete flow directory
 * (missing/partial flow.json — e.g. an interrupted write, a merge conflict, a
 * manually-created folder) is skipped with a warning rather than aborting the
 * whole Run: the Flow Map is human-editable and lives in the user's repo, so it
 * must never fail closed on one bad entry.
 */
export async function listFlows(repoRoot: string): Promise<FlowMeta[]> {
  let entries;
  try {
    entries = await readdir(flowMapDir(repoRoot), { withFileTypes: true });
  } catch {
    return []; // no map yet — first Run on this repo
  }
  const flows: FlowMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(flowMapDir(repoRoot), entry.name, 'flow.json');
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8')) as FlowMeta;
      if (typeof meta?.id !== 'string' || typeof meta?.title !== 'string') {
        console.warn(`skipping flow "${entry.name}": flow.json is missing required fields`);
        continue;
      }
      flows.push(meta);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`skipping flow "${entry.name}": could not read flow.json (${reason})`);
    }
  }
  return flows;
}

async function writeMeta(repoRoot: string, meta: FlowMeta): Promise<void> {
  const stamped: FlowMeta = { schemaVersion: FLOW_SCHEMA_VERSION, ...meta };
  await writeFile(join(flowDir(repoRoot, meta.id), 'flow.json'), JSON.stringify(stamped, null, 2));
}

/** Update a Flow's metadata in place (e.g. lastPassedAt after a green replay). */
export async function saveFlowMeta(repoRoot: string, meta: FlowMeta): Promise<void> {
  await writeMeta(repoRoot, meta);
}

/** Flows enter the map automatically on first successful execution (ADR-0001). */
export async function addFlow(repoRoot: string, meta: FlowMeta, playwrightScript: string): Promise<void> {
  const dir = flowDir(repoRoot, meta.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'flow.mts'), playwrightScript);
  await writeMeta(repoRoot, meta);
}

/** Read a Flow's executable script (flow.mts). */
export async function readFlowScript(repoRoot: string, id: string): Promise<string> {
  return readFile(join(flowDir(repoRoot, id), 'flow.mts'), 'utf8');
}

/**
 * Record a Heal (CONTEXT.md): overwrite flow.mts with the rewritten script
 * while retaining the pre-heal version on the Flow's metadata, so a later
 * Reject can revert. Returns the updated metadata.
 */
export async function healFlow(
  repoRoot: string,
  meta: FlowMeta,
  healedScript: string,
  healedInRun?: string,
): Promise<FlowMeta> {
  const dir = flowDir(repoRoot, meta.id);
  const previousScript = await readFlowScript(repoRoot, meta.id);
  await writeFile(join(dir, 'flow.mts'), healedScript);
  const healed: FlowMeta = {
    ...meta,
    heal: { previousScript, healedAt: new Date().toISOString(), healedInRun },
  };
  await writeMeta(repoRoot, healed);
  return healed;
}

/**
 * Reject a Heal (CONTEXT.md): restore the pre-heal script and clear the heal
 * record. Returns the reverted metadata. Throws if the Flow has no Heal to
 * revert, so callers can surface a clear error.
 */
export async function revertHeal(repoRoot: string, meta: FlowMeta): Promise<FlowMeta> {
  if (!meta.heal) {
    throw new Error(`flow "${meta.id}" has no Heal to revert`);
  }
  await writeFile(join(flowDir(repoRoot, meta.id), 'flow.mts'), meta.heal.previousScript);
  const { heal: _discarded, ...reverted } = meta;
  await writeMeta(repoRoot, reverted);
  return reverted;
}
