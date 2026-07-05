import pc from 'picocolors';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadConfig, loadDotEnv } from '../config.js';
import { listAvailableModels } from '../agents/harness.js';
import { getSupabase, isSupabaseConfigured, resolveAnalysisId } from '../publish/supabase-client.js';
import { publishRun } from '../publish/publish.js';
import { join } from 'node:path';
import { isEffort, type Effort } from '../run/effort.js';
import { executeRun } from '../run/run.js';
import { CompositeReporter, ConsoleReporter, createReporter } from '../stream/index.js';
import { executeSingleTestRun, publishSingleTestArtifact } from './single-test.js';
import { SupabaseQueue, type RunQueue, type RunRequest } from './queue.js';

const POLL_MS = 5_000;

export interface ServeOptions {
  repoRoot: string;
}

async function resolveTarget(request: RunRequest, repoRoot: string): Promise<URL> {
  if (request.targetUrl) return new URL(request.targetUrl);
  const config = await loadConfig(repoRoot);
  if (!config?.target) throw new Error('no target_url on run and no target in .autoend/config.json');
  return new URL(config.target);
}

async function resolveEffort(request: RunRequest, repoRoot: string): Promise<Effort> {
  if (request.effort && isEffort(request.effort)) return request.effort;
  const config = await loadConfig(repoRoot);
  return config?.effort ?? 'mid';
}

async function processRun(request: RunRequest, repoRoot: string, queue: RunQueue): Promise<void> {
  try {
    const target = await resolveTarget(request, repoRoot);
    const effort = await resolveEffort(request, repoRoot);
    const config = await loadConfig(repoRoot);
    // The run carries its own analysis_id (its project); stream and publish under
    // that same id so each project's data stays isolated and a re-run replaces
    // only its own project.
    const analysisId = resolveAnalysisId({ analysisId: request.analysisId ?? config?.analysisId });
    const streamReporter = createReporter({
      runId: request.runId,
      analysisId,
      console: false,
    });
    const reporter = new CompositeReporter([new ConsoleReporter(), streamReporter]);

    if (request.kind === 'single-test') {
      if (!request.testId) throw new Error('single-test run missing test_id');
      const { artifactDir, artifact } = await executeSingleTestRun({
        repoRoot,
        target,
        runId: request.runId,
        testId: request.testId,
        reporter,
        effort,
        kind: 'single-test',
      });
      await publishSingleTestArtifact(artifactDir, artifact, analysisId);
    } else {
      const { artifactDir, artifact } = await executeRun({
        repoRoot,
        target,
        effort,
        runId: request.runId,
        kind: 'full',
        reporter,
        // The UI's per-run choice wins; env/config are the daemon's defaults.
        model: request.model ?? process.env.AUTOEND_MODEL ?? config?.model,
        runtime: config?.runtime,
        cloudRepo: config?.cloudRepo,
      });
      await publishRun(artifact, join(artifactDir, 'evidence'), analysisId);
    }
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
 * Publish the account's available Cursor models to the `ai_models` table so the
 * UI can offer a real, live model picker (Lumen has no Cursor SDK access). The
 * daemon is the natural place: it already holds CURSOR_API_KEY. Best-effort —
 * a failure here must never stop the daemon from serving runs.
 */
async function publishModels(supabase: SupabaseClient): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.warn(pc.yellow('CURSOR_API_KEY not set — skipping ai_models publish (UI picker will be empty)'));
    return;
  }
  const models = await listAvailableModels(apiKey);
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
  const ids = models.map((m) => m.id);
  const { error: pruneError } = await supabase
    .from('ai_models')
    .delete()
    .not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`);
  if (pruneError) console.warn(pc.yellow(`could not prune ai_models: ${pruneError.message}`));
  console.log(pc.cyan('published models') + pc.dim(` · ${ids.join(', ')}`));
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
  // By default the daemon serves EVERY project: it claims any queued run and
  // uses that run's own analysis_id. Pin it to a single project only when one is
  // explicitly configured (AUTOEND_ANALYSIS_ID env or config.analysisId).
  const scopedAnalysisId = process.env.AUTOEND_ANALYSIS_ID ?? config?.analysisId;
  const queue = new SupabaseQueue(supabase, scopedAnalysisId);

  console.log(
    pc.cyan('autoend serve') +
      pc.dim(` · watching ${scopedAnalysisId ? `analysis ${scopedAnalysisId}` : 'all projects'}`),
  );

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
        await processRun(request, opts.repoRoot, queue);
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
