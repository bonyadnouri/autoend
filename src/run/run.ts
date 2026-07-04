import { readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { resolveModel } from '../agents/harness.js';
import { loadConfig } from '../config.js';
import { listFlows } from '../map/flow-map.js';
import { exploreDeep } from '../explore/deep.js';
import { explore, type ExplorationResult } from '../explore/explorer.js';
import { ensureBrief } from '../recon/recon.js';
import { replayFlowMap } from '../replay/replay.js';
import { join } from 'node:path';
import { prepareRunDir, writeReport } from '../report/artifact.js';
import type { Environment, Finding, RunArtifact } from '../report/types.js';
import { createReporter, type RunKind, type RunReporter } from '../stream/index.js';
import { triageFindings } from '../triage/triage.js';
import { verifyCandidates } from '../verify/verifier.js';
import { EFFORT_PIPELINES, type Effort } from './effort.js';

export interface RunOptions {
  target: URL;
  effort: Effort;
  repoRoot: string;
  /** Model id override (--model, AUTOEND_MODEL, config); default: strongest available (ADR-0009). */
  model?: string;
  /** External run id (queue row id from Lumen daemon). */
  runId?: string;
  kind?: RunKind;
  reporter?: RunReporter;
  /** Skip phase 2 (single-test replay from daemon). */
  skipExploration?: boolean;
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
 * (always completes); phase 2 explores new surface within the Effort budget —
 * as the fast smoke pass at low/mid, or the staged pipeline (Recon → persona
 * Waves → Verifier → Triage) from high upward (ADR-0007). Output is a
 * self-contained Run artifact (ADR-0004).
 */
export async function executeRun(opts: RunOptions): Promise<RunOutcome> {
  const startedAt = new Date().toISOString();
  const runId = opts.runId ?? startedAt.replace(/[:.]/g, '-');
  const config = await loadConfig(opts.repoRoot);
  const reporter =
    opts.reporter ??
    createReporter({ runId, analysisId: config?.analysisId, console: false, supabase: true });
  const { dir, evidenceDir } = await prepareRunDir(opts.repoRoot, runId);

  let runFailed = false;
  let runError: string | undefined;
  let flowsReplayed = 0;
  let flowsDiscovered = 0;
  let findingCounts: Record<string, number> = {};

  await reporter.runStarted({
    runId,
    target: opts.target.href,
    effort: opts.effort,
    kind: opts.kind ?? 'full',
  });

  try {
    const flows = await listFlows(opts.repoRoot);
    const replay = await replayFlowMap(opts.repoRoot, opts.target, flows, evidenceDir, { reporter });
    flowsReplayed = replay.replayed;

    const shape = EFFORT_PIPELINES[opts.effort];
    const apiKey = process.env.CURSOR_API_KEY;
    let model: string | undefined;

    let exploration: ExplorationResult;
    if (opts.skipExploration) {
      exploration = { discovered: 0, findings: [], flows: [] };
    } else if (!apiKey) {
      console.warn('exploration skipped: CURSOR_API_KEY not set — run `npx @bonyadnouri/autoend init`');
      exploration = { discovered: 0, findings: [], flows: [] };
    } else {
      await reporter.event({ type: 'phase', phase: 'exploration', state: 'started' });
      try {
        model = await resolveModel(apiKey, opts.model);
        console.log(`agents run on model "${model}" (ADR-0009)`);
        const base = {
          repoRoot: opts.repoRoot,
          target: opts.target,
          budget: shape,
          runDir: dir,
          evidenceDir,
          knownFlows: flows,
          model,
          apiKey,
          reporter,
        };
        if (shape.kind === 'smoke') {
          exploration = await explore(base);
        } else {
          const brief = shape.recon
            ? await ensureBrief({ repoRoot: opts.repoRoot, target: opts.target, model, apiKey }).catch((error) => {
                console.warn(`recon failed; continuing without a brief: ${error instanceof Error ? error.message : String(error)}`);
                return undefined;
              })
            : undefined;
          const deep = await exploreDeep({ ...base, shape, brief });
          const verifyFindings = [...deep.findings];
          if (shape.verifier && deep.candidates.length > 0) {
            try {
              verifyFindings.push(
                ...(await verifyCandidates(deep.candidates, { target: opts.target, runDir: dir, evidenceDir, model, apiKey })),
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.warn(`verifier stage failed; ${deep.candidates.length} candidates go unverified: ${message}`);
            }
          }
          exploration = { discovered: deep.discovered, findings: verifyFindings, flows: deep.flows };
        }
        await reporter.event({ type: 'phase', phase: 'exploration', state: 'finished' });
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

    flowsDiscovered = exploration.discovered;

    let findings = [...replay.findings, ...exploration.findings];
    if (shape.triage && apiKey && model) {
      await reporter.event({ type: 'phase', phase: 'triage', state: 'started' });
      try {
        findings = await triageFindings(findings, { repoRoot: opts.repoRoot, model, apiKey });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`triage failed; findings remain unannotated: ${message}`);
      }
      await reporter.event({ type: 'phase', phase: 'triage', state: 'finished' });
    }

    for (const finding of findings) {
      await reporter.event({
        type: 'finding',
        findingId: finding.id,
        kind: finding.kind,
        title: finding.title,
      });
    }
    findingCounts = findings.reduce<Record<string, number>>((acc, f) => {
      acc[f.kind] = (acc[f.kind] ?? 0) + 1;
      return acc;
    }, {});

    const pkg = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const environment: Environment = {
      browser: replay.browserVersion ? `Chromium ${replay.browserVersion}` : 'Chromium (not launched)',
      viewport: '1280×720',
      os: `${process.platform} ${release()}`,
      node: process.version,
      autoendVersion: pkg.version,
      model,
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
      findings: filterSuppressed(findings, await readSuppressedTitles(opts.repoRoot)),
      heals: replay.heals,
    };
    await writeReport(dir, artifact);
    return { artifactDir: dir, artifact };
  } catch (error) {
    runFailed = true;
    runError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await reporter.runFinished({
      runId,
      status: runFailed ? 'failed' : 'finished',
      error: runError,
      flowsReplayed,
      flowsDiscovered,
      findingCounts,
    });
  }
}
