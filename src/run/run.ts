import { readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { resolveModel } from '../agents/harness.js';
import { listFlows } from '../map/flow-map.js';
import { exploreDeep } from '../explore/deep.js';
import { explore, type ExplorationResult } from '../explore/explorer.js';
import { ensureBrief } from '../recon/recon.js';
import { replayFlowMap } from '../replay/replay.js';
import { join } from 'node:path';
import { prepareRunDir, writeReport } from '../report/artifact.js';
import type { Environment, Finding, RunArtifact } from '../report/types.js';
import { triageFindings } from '../triage/triage.js';
import { verifyCandidates } from '../verify/verifier.js';
import { EFFORT_PIPELINES, type Effort } from './effort.js';

export interface RunOptions {
  target: URL;
  effort: Effort;
  repoRoot: string;
  /** Model id override (--model, AUTOEND_MODEL, config); default: strongest available (ADR-0009). */
  model?: string;
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
  const runId = startedAt.replace(/[:.]/g, '-');
  const { dir, evidenceDir } = await prepareRunDir(opts.repoRoot, runId);

  const flows = await listFlows(opts.repoRoot);
  const replay = await replayFlowMap(opts.repoRoot, opts.target, flows, evidenceDir);

  const shape = EFFORT_PIPELINES[opts.effort];
  const apiKey = process.env.CURSOR_API_KEY;
  let model: string | undefined;

  // Exploration is best-effort (issue #1): replaying the whole map always
  // completes, so an exploration crash must never swallow replay's regressions
  // or skip the report. Degrade to an empty result plus an advisory instead.
  let exploration: ExplorationResult;
  if (!apiKey) {
    console.warn('exploration skipped: CURSOR_API_KEY not set — run `npx @bonyadnouri/autoend init`');
    exploration = { discovered: 0, findings: [], flows: [] };
  } else {
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
      };
      if (shape.kind === 'smoke') {
        exploration = await explore(base);
      } else {
        // A Recon crash degrades to fallback Missions, never to a dead Run.
        const brief = shape.recon
          ? await ensureBrief({ repoRoot: opts.repoRoot, target: opts.target, model, apiKey }).catch((error) => {
              console.warn(`recon failed; continuing without a brief: ${error instanceof Error ? error.message : String(error)}`);
              return undefined;
            })
          : undefined;
        const deep = await exploreDeep({ ...base, shape, brief });
        const findings = [...deep.findings];
        if (shape.verifier && deep.candidates.length > 0) {
          // Verification runs AFTER the waves banked their results; a Verifier
          // crash must degrade to "deep findings without Defects", never erase
          // the completed waves (ADR-0008: a flaky Verifier can't bury a bug).
          try {
            findings.push(
              ...(await verifyCandidates(deep.candidates, { target: opts.target, runDir: dir, evidenceDir, model, apiKey })),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`verifier stage failed; ${deep.candidates.length} candidates go unverified: ${message}`);
          }
        }
        exploration = { discovered: deep.discovered, findings, flows: deep.flows };
      }
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

  // Triage annotates across BOTH phases — replay Regressions are its primary
  // customer ("did the app change on purpose?"). Annotate-only (ADR-0008).
  let findings = [...replay.findings, ...exploration.findings];
  if (shape.triage && apiKey && model) {
    try {
      findings = await triageFindings(findings, { repoRoot: opts.repoRoot, model, apiKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`triage failed; findings remain unannotated: ${message}`);
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
}
