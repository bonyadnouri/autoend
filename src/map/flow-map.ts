import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
export interface FlowMeta {
  id: string;
  title: string;
  discoveredAt: string;
  lastPassedAt?: string;
  /** Fingerprints of Suppressed Advisories attached to this Flow. */
  suppressedAdvisories?: string[];
}

export function flowMapDir(repoRoot: string): string {
  return join(repoRoot, '.autoend', 'flows');
}

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
    const raw = await readFile(join(flowMapDir(repoRoot), entry.name, 'flow.json'), 'utf8');
    flows.push(JSON.parse(raw) as FlowMeta);
  }
  return flows;
}

/** Update a Flow's metadata in place (e.g. lastPassedAt after a green replay). */
export async function saveFlowMeta(repoRoot: string, meta: FlowMeta): Promise<void> {
  await writeFile(join(flowMapDir(repoRoot), meta.id, 'flow.json'), JSON.stringify(meta, null, 2));
}

/**
 * Dismiss (CONTEXT.md): permanent map surgery — the Flow leaves the Map. A
 * plain file edit performed by the viewer server (ADR-0004).
 */
export async function removeFlow(repoRoot: string, flowId: string): Promise<void> {
  await rm(join(flowMapDir(repoRoot), flowId), { recursive: true, force: true });
}

/** Flows enter the map automatically on first successful execution (ADR-0001). */
export async function addFlow(repoRoot: string, meta: FlowMeta, playwrightScript: string): Promise<void> {
  const dir = join(flowMapDir(repoRoot), meta.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'flow.json'), JSON.stringify(meta, null, 2));
  await writeFile(join(dir, 'flow.mts'), playwrightScript);
}
