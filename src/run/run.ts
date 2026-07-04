import { listFlows } from '../map/flow-map.js';
import { explore } from '../explore/explorer.js';
import { replayFlowMap } from '../replay/replay.js';
import { buildGraph } from '../graph/graph.js';
import { prepareRunDir, writeReport } from '../report/artifact.js';
import type { RunArtifact } from '../report/types.js';
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

  // Cluster every navigation observed this Run into the interaction map (#16).
  const graph = buildGraph([...replay.transitions, ...exploration.transitions], opts.target);

  const artifact: RunArtifact = {
    runId,
    target: opts.target.href,
    effort: opts.effort,
    startedAt,
    finishedAt: new Date().toISOString(),
    flowsReplayed: replay.replayed,
    flowsDiscovered: exploration.discovered,
    findings: [...replay.findings, ...exploration.findings],
    heals: replay.heals,
    graph,
  };
  await writeReport(dir, artifact);
  return { artifactDir: dir, artifact };
}
