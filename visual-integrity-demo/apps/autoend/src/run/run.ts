import { readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { listFlows } from '../map/flow-map.js';
import { explore, type ExplorationResult } from '../explore/explorer.js';
import { replayFlowMap } from '../replay/replay.js';
import { join } from 'node:path';
import { prepareRunDir, writeReport } from '../report/artifact.js';
import type { Environment, Finding, RunArtifact } from '../report/types.js';
import { EFFORT_BUDGETS, type Effort } from './effort.js';
import { runTargetVisualCheck } from '../visual/run-check.js';

export interface RunOptions {
  target: URL;
  effort: Effort;
  repoRoot: string;
  /** Overrides the minted timestamp-based run id (e.g. AUTOEND_RUN_ID from a cloud run). */
  runId?: string;
  /** Overrides the default .autoend/runs root (e.g. AUTOEND_ARTIFACT_DIR from a cloud run). */
  artifactRoot?: string;
  /** Set false to skip phase 2 entirely — a strictly read-only replay smoke check (AUTOEND_FLOW_SYNC_MODE=none). Defaults to true. */
  explore?: boolean;
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
  const runId = opts.runId ?? startedAt.replace(/[:.]/g, '-');
  const { dir, evidenceDir } = await prepareRunDir(opts.repoRoot, runId, opts.artifactRoot);

  const flows = await listFlows(opts.repoRoot);
  const replay = await replayFlowMap(opts.repoRoot, opts.target, flows, evidenceDir);

  // Exploration is best-effort (issue #1): replaying the whole map always
  // completes, so an exploration crash must never swallow replay's regressions
  // or skip the report. Degrade to an empty result plus an advisory instead.
  let exploration: ExplorationResult;
  if (opts.explore === false) {
    exploration = {
      discovered: 0,
      findings: [
        {
          id: 'exploration-skipped',
          kind: 'advisory',
          title: 'Exploration skipped (flow sync mode: none)',
          detail: 'AUTOEND_FLOW_SYNC_MODE=none requested a replay-only run; the Flow Map was not mutated.',
        },
      ],
      flows: [],
    };
  } else {
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
        flows: [],
      };
    }
  }

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

  const visualFindings = await runTargetVisualCheck({
    target: opts.target,
    repoRoot: opts.repoRoot,
    evidenceDir,
    runId,
  });

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
      [...replay.findings, ...exploration.findings, ...visualFindings],
      await readSuppressedTitles(opts.repoRoot),
    ),
    heals: replay.heals,
  };
  await writeReport(dir, artifact);
  return { artifactDir: dir, artifact };
}
