import { listFlows } from '../map/flow-map.js';
import { explore, type ExplorationResult } from '../explore/explorer.js';
import { replayFlowMap } from '../replay/replay.js';
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

  // Exploration is best-effort (issue #1): replaying the whole map always
  // completes, so an exploration crash must never swallow replay's regressions
  // or skip the report. Degrade to an empty result plus an advisory instead.
  let exploration: ExplorationResult;
  try {
    exploration = await explore({
      repoRoot: opts.repoRoot,
      target: opts.target,
      budget: EFFORT_BUDGETS[opts.effort],
      runDir: dir,
      evidenceDir,
      knownFlows: flows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`exploration failed; reporting replay results only: ${message}`);
    exploration = {
      discovered: 0,
      findings: [
        {
          id: 'exploration-failed',
          kind: 'advisory',
          title: 'Exploration phase did not complete',
          detail: `Exploration failed and was skipped: ${message}. Replay results below are still complete.`,
        },
      ],
    };
  }

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
  };
  await writeReport(dir, artifact);
  return { artifactDir: dir, artifact };
}
