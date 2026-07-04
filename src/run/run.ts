import { readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { listFlows } from '../map/flow-map.js';
import { explore } from '../explore/explorer.js';
import { replayFlowMap } from '../replay/replay.js';
import { join } from 'node:path';
import { prepareRunDir, writeReport } from '../report/artifact.js';
import type { Environment, Finding, RunArtifact } from '../report/types.js';
import { EFFORT_BUDGETS, type Effort } from './effort.js';

export interface RunOptions {
  target: URL;
  effort: Effort;
  repoRoot: string;
}

export interface RunOutcome {
  artifactDir: string;
  artifact: RunArtifact;
}

/**
 * Suppress (CONTEXT.md): "future Runs stop re-reporting" — drop Advisories
 * whose title the user suppressed. Other Finding kinds always pass through.
 */
export function filterSuppressed(findings: Finding[], suppressed: string[]): Finding[] {
  return findings.filter((f) => f.kind !== 'advisory' || !suppressed.includes(f.title));
}

/** Titles from .autoend/suppressed.json; missing or corrupt file means nothing suppressed. */
async function readSuppressedTitles(repoRoot: string): Promise<string[]> {
  try {
    const raw = await readFile(join(repoRoot, '.autoend', 'suppressed.json'), 'utf8');
    const parsed = JSON.parse(raw) as { advisories?: unknown };
    return Array.isArray(parsed.advisories)
      ? parsed.advisories.filter((t): t is string => typeof t === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * A Run (CONTEXT.md): two ordered phases. Phase 1 replays the whole Flow Map
 * (always completes); phase 2 explores new surface within the Effort budget.
 * Output is a self-contained Run artifact (ADR-0004).
 */
export async function executeRun(opts: RunOptions): Promise<RunOutcome> {
  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[:.]/g, '-');
  const { dir, evidenceDir } = await prepareRunDir(opts.repoRoot, runId);

  const flows = await listFlows(opts.repoRoot);
  const replay = await replayFlowMap(opts.repoRoot, opts.target, flows, evidenceDir);
  const exploration = await explore({
    repoRoot: opts.repoRoot,
    target: opts.target,
    budget: EFFORT_BUDGETS[opts.effort],
    runDir: dir,
    evidenceDir,
    knownFlows: flows,
  });

  const pkg = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const environment: Environment = {
    browser: replay.browserVersion ? `Chromium ${replay.browserVersion}` : 'Chromium (not launched)',
    viewport: '1280×720',
    os: `${process.platform} ${release()}`,
    node: process.version,
    autoendVersion: pkg.version,
  };

  const artifact: RunArtifact = {
    runId,
    target: opts.target.href,
    effort: opts.effort,
    startedAt,
    finishedAt: new Date().toISOString(),
    flowsReplayed: replay.replayed,
    flowsDiscovered: exploration.discovered,
    flows: [...replay.flows, ...exploration.flows],
    environment,
    findings: filterSuppressed(
      [...replay.findings, ...exploration.findings],
      await readSuppressedTitles(opts.repoRoot),
    ),
    heals: replay.heals,
  };
  await writeReport(dir, artifact);
  return { artifactDir: dir, artifact };
}
