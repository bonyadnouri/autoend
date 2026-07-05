import pc from 'picocolors';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rm } from 'node:fs/promises';
import { loadConfig, loadDotEnv, resolveRuntime } from '../config.js';
import { listAvailableModels, resolveLlmProvider, type AgentRuntime } from '../agents/harness.js';
import { getSupabase, isSupabaseConfigured, resolveAnalysisId } from '../publish/supabase-client.js';
import { publishRun } from '../publish/publish.js';
import { addFlow, flowMapDir } from '../map/flow-map.js';
import { join } from 'node:path';
import { isEffort, type Effort } from '../run/effort.js';
import { executeRun } from '../run/run.js';
import type { RunArtifact } from '../report/types.js';
import { CompositeReporter, ConsoleReporter, createReporter } from '../stream/index.js';
import { executeSingleTestRun, publishSingleTestArtifact } from './single-test.js';
import { SupabaseQueue, type RunQueue, type RunRequest } from './queue.js';

const POLL_MS = 5_000;

export interface ServeOptions {
  repoRoot: string;
  /** Where explorers run for every served run; overrides config/env. */
  runtime?: AgentRuntime;
}

async function resolveTarget(request: RunRequest, repoRoot: string): Promise<URL> {
  if (request.targetUrl) return new URL(request.targetUrl);
  // No target on the run: use the PROJECT's own URL (its analyses row). The
  // daemon serves many projects, so the local .autoend/config.json target
  // (often localhost) is only a last resort — falling back to it for a re-run
  // queued from the UI would replay the test against the wrong app entirely.
  if (request.analysisId) {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase
        .from('analyses')
        .select('app_url')
        .eq('id', request.analysisId)
        .maybeSingle();
      if (data?.app_url) return new URL(data.app_url as string);
    }
  }
  const config = await loadConfig(repoRoot);
  if (!config?.target) throw new Error('no target_url on run, no app_url on its analysis, and no target in .autoend/config.json');
  return new URL(config.target);
}

async function resolveEffort(request: RunRequest, repoRoot: string): Promise<Effort> {
  if (request.effort && isEffort(request.effort)) return request.effort;
  const config = await loadConfig(repoRoot);
  return config?.effort ?? 'mid';
}

/**
 * A per-project working directory under the daemon's repo. The Flow Map, runs,
 * brief, and leads all live under `<workspace>/.autoend/`, so each project (URL)
 * keeps its OWN saved flows. Without this every project shared one
 * `.autoend/flows/`, and a run for one URL would replay another URL's flows
 * (e.g. a saucedemo.com run replaying testpad's saved flows). Local CLI runs are
 * unaffected — they use the repo root directly and keep a single committed map.
 */
function projectWorkspace(repoRoot: string, analysisId: string): string {
  const safe = analysisId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
  return join(repoRoot, '.autoend', 'projects', safe);
}

/**
 * Make the database the source of truth for a project's Flow Map. Before a
 * daemon run, rebuild the project workspace's local flows from the ones stored
 * in Supabase for THIS analysis (each `tests` row keeps its executable script),
 * so replay runs exactly the flows the DB knows for this project — never another
 * project's, and never a stale local copy. The local files are just an execution
 * scratch here; the committed local map still drives standalone CLI runs, which
 * don't go through the daemon.
 *
 * Returns the number of flows loaded, or -1 when Supabase isn't configured — in
 * which case we leave the local flow map untouched (the only source when there's
 * no DB, exactly as intended).
 */
async function hydrateFlowMapFromDb(workspace: string, analysisId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return -1;
  const { data, error } = await supabase
    .from('tests')
    .select('id, name, script, status')
    // Only real flow rows carry a script; synthetic finding-tests have none.
    // Warnings/not-executed were never part of the replayable map; pass + fail
    // (regressions) are, so we keep replaying a regressed flow until it's fixed.
    .eq('analysis_id', analysisId)
    .not('script', 'is', null)
    .in('status', ['pass', 'fail']);
  if (error) {
    console.warn(pc.yellow(`could not load flow map from DB: ${error.message}`));
    return -1;
  }
  const rows = data ?? [];
  // Rebuild from scratch so a flow removed in the DB can't linger locally and
  // get replayed anyway.
  await rm(flowMapDir(workspace), { recursive: true, force: true });
  const now = new Date().toISOString();
  for (const row of rows) {
    const script = row.script as string | null;
    if (!script) continue;
    await addFlow(
      workspace,
      { id: row.id as string, title: (row.name as string) ?? (row.id as string), discoveredAt: now, lastPassedAt: now },
      script,
    );
  }
  return rows.length;
}

/**
 * Publish results without letting a publish failure fail the run. Publishing
 * runs after the run itself has completed (screens/tests already streamed live),
 * so a publish error is a reporting problem, not a run failure — log it and
 * leave the run 'finished' rather than flipping a successful run to 'failed'.
 */
async function publishSafely(label: string, publish: () => Promise<unknown>): Promise<void> {
  try {
    await publish();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`publish (${label}) failed; run kept as finished: ${message}`));
  }
}

async function processRun(
  request: RunRequest,
  repoRoot: string,
  queue: RunQueue,
  runtime: AgentRuntime,
): Promise<void> {
  try {
    const target = await resolveTarget(request, repoRoot);
    const effort = await resolveEffort(request, repoRoot);
    const config = await loadConfig(repoRoot);
    // The run carries its own analysis_id (its project); stream and publish under
    // that same id so each project's data stays isolated and a re-run replaces
    // only its own project.
    const analysisId = resolveAnalysisId({ analysisId: request.analysisId ?? config?.analysisId });
    // Each project runs in its own workspace so its Flow Map is isolated from
    // other projects served by the same daemon.
    const workspace = projectWorkspace(repoRoot, analysisId);
    // Load this project's Flow Map from the DB (the source of truth) so replay
    // uses the project's own saved flows, not a stale/shared local copy.
    const hydrated = await hydrateFlowMapFromDb(workspace, analysisId);
    if (hydrated >= 0) {
      console.log(pc.dim(`flow map · ${hydrated} flow(s) loaded from the database`));
    }
    const streamReporter = createReporter({
      runId: request.runId,
      analysisId,
      console: false,
    });
    const reporter = new CompositeReporter([new ConsoleReporter(), streamReporter]);

    let artifact: RunArtifact;
    if (request.kind === 'single-test') {
      if (!request.testId) throw new Error('single-test run missing test_id');
      const result = await executeSingleTestRun({
        repoRoot: workspace,
        target,
        runId: request.runId,
        testId: request.testId,
        reporter,
        effort,
        kind: 'single-test',
      });
      artifact = result.artifact;
      // Drain the streaming reporter BEFORE publish. testStatus calls are
      // fire-and-forget on an internal queue — without this, a late queued write
      // could land after publish and wipe investigation video URLs back to null.
      await reporter.flush();
      await publishSafely('single-test', () =>
        publishSingleTestArtifact(result.artifactDir, result.artifact, analysisId),
      );
    } else {
      const result = await executeRun({
        repoRoot: workspace,
        target,
        effort,
        runId: request.runId,
        kind: 'full',
        reporter,
        // The UI's per-run choice wins; env/config are the daemon's defaults.
        model: request.model ?? process.env.AUTOEND_MODEL ?? config?.model,
        runtime,
        cloudRepo: config?.cloudRepo,
      });
      artifact = result.artifact;
      await reporter.flush();
      await publishSafely('run', () =>
        publishRun(result.artifact, join(result.artifactDir, 'evidence'), analysisId),
      );
    }

    // Authoritative finish, AFTER publish. The streaming reporter also flips the
    // row to 'finished', but it's fire-and-forget and swallows DB errors — a
    // dropped update would leave the run stuck 'running' forever. Marking it here
    // is the backstop. A publish failure above is logged, not thrown: the run
    // itself succeeded, so it must never be reported as 'failed' (which is what
    // would happen if a publish error fell through to the catch below).
    await queue.markFinished(request.runId, {
      runId: request.runId,
      status: 'finished',
      flowsReplayed: artifact.flowsReplayed,
      flowsDiscovered: artifact.flowsDiscovered,
      findingCounts: artifact.findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.kind] = (acc[f.kind] ?? 0) + 1;
        return acc;
      }, {}),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`run ${request.runId} failed: ${errorMessage}`));
    // Backstop: the reporter marks the run failed when the failure is inside a
    // run, but errors before/around it (resolveTarget, reporter setup) would
    // otherwise leave the claimed row stuck 'running'.
    await queue.markFailed(request.runId, errorMessage).catch(() => {});
  }
}

/**
 * Publish available LLM models to the `ai_models` table so the UI can offer a
 * real, live model picker (Lumen has no SDK access). Provider comes from
 * AUTOEND_LLM_PROVIDER (cursor default, openrouter when set). Best-effort —
 * a failure here must never stop the daemon from serving runs.
 */
async function publishModels(supabase: SupabaseClient): Promise<void> {
  const provider = resolveLlmProvider();
  const apiKey =
    provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.warn(
      pc.yellow(
        provider === 'openrouter'
          ? 'OPENROUTER_API_KEY not set — skipping ai_models publish (UI picker will be empty)'
          : 'CURSOR_API_KEY not set — skipping ai_models publish (UI picker will be empty)',
      ),
    );
    return;
  }
  const models = await listAvailableModels(apiKey, provider);
  if (models.length === 0) return;
  const now = new Date().toISOString();
  const { error: upsertError } = await supabase.from('ai_models').upsert(
    models.map((m) => ({ id: m.id, label: m.label, is_default: m.isDefault, updated_at: now })),
    { onConflict: 'id' },
  );
  if (upsertError) {
    console.warn(pc.yellow(`could not publish ai_models: ${upsertError.message}`));
    return;
  }
  // Prune models no longer offered so the picker never shows dead options.
  // JSON.stringify quotes/escapes each id so an id with a comma or quote can't
  // break (or mis-target) the PostgREST `in.(...)` list — same guard publish uses.
  const ids = models.map((m) => m.id);
  const { error: pruneError } = await supabase
    .from('ai_models')
    .delete()
    .not('id', 'in', `(${ids.map((id) => JSON.stringify(String(id))).join(',')})`);
  if (pruneError) console.warn(pc.yellow(`could not prune ai_models: ${pruneError.message}`));
  console.log(pc.cyan(`published models (${provider})`) + pc.dim(` · ${ids.join(', ')}`));
}

/** Long-running daemon: claim queued runs from Supabase and execute them. */
export async function runServe(opts: ServeOptions): Promise<never> {
  await loadDotEnv(opts.repoRoot);
  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set to run the daemon');
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error('could not create Supabase client');

  const config = await loadConfig(opts.repoRoot);
  // Where explorers run for every served run: the --runtime flag wins, then
  // AUTOEND_RUNTIME / config.runtime, else local. On Windows/macOS hosts where
  // local agent tooling is flaky, `serve --runtime cloud` runs each explorer in
  // a Cursor Linux VM instead.
  const runtime = opts.runtime ?? resolveRuntime(config);
  // By default the daemon serves EVERY project: it claims any queued run and
  // uses that run's own analysis_id. Pin it to a single project only when one is
  // explicitly configured (AUTOEND_ANALYSIS_ID env or config.analysisId).
  const scopedAnalysisId = process.env.AUTOEND_ANALYSIS_ID ?? config?.analysisId;
  const queue = new SupabaseQueue(supabase, scopedAnalysisId);

  console.log(
    pc.cyan('autoend serve') +
      pc.dim(
        ` · watching ${scopedAnalysisId ? `analysis ${scopedAnalysisId}` : 'all projects'} · runtime ${runtime}`,
      ),
  );

  // Start idle: cancel any run left over from a previous session so the daemon
  // waits for a fresh request instead of immediately executing a stale queued
  // (or orphaned running) run that the user never asked to re-run.
  const cleared = await queue.cancelStale().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(pc.yellow(`could not clear stale runs: ${message}`));
    return 0;
  });
  if (cleared > 0) {
    console.log(pc.dim(`cleared ${cleared} stale run(s) from a previous session`));
  }

  // Publish the live model list up front (best-effort) so the UI picker is ready.
  await publishModels(supabase).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(pc.yellow(`publishModels failed: ${message}`));
  });

  let busy = false;
  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      // Drain: keep claiming until the queue is empty, so a run queued while
      // another was executing isn't stranded until the next poll.
      let request = await queue.claimNext();
      while (request) {
        await processRun(request, opts.repoRoot, queue, runtime);
        request = await queue.claimNext();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(pc.yellow(`daemon tick failed: ${message}`));
    } finally {
      busy = false;
    }
  };

  const unwatch = queue.watch(() => void tick());
  await tick();

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => void tick(), POLL_MS);
    const onSignal = (): void => {
      clearInterval(interval);
      unwatch();
      resolve();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });

  return undefined as never;
}
