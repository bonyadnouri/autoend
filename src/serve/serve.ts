import pc from 'picocolors';
import { loadConfig, loadDotEnv } from '../config.js';
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
    const streamReporter = createReporter({
      runId: request.runId,
      analysisId: request.analysisId ?? config?.analysisId,
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
      await publishSingleTestArtifact(artifactDir, artifact);
    } else {
      const { artifactDir, artifact } = await executeRun({
        repoRoot,
        target,
        effort,
        runId: request.runId,
        kind: 'full',
        reporter,
        model: process.env.AUTOEND_MODEL ?? config?.model,
        runtime: config?.runtime,
        cloudRepo: config?.cloudRepo,
      });
      await publishRun(artifact, join(artifactDir, 'evidence'));
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

/** Long-running daemon: claim queued runs from Supabase and execute them. */
export async function runServe(opts: ServeOptions): Promise<never> {
  await loadDotEnv(opts.repoRoot);
  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set to run the daemon');
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error('could not create Supabase client');

  const config = await loadConfig(opts.repoRoot);
  const analysisId = resolveAnalysisId({ analysisId: config?.analysisId });
  const queue = new SupabaseQueue(supabase, analysisId);

  console.log(pc.cyan('autoend serve') + pc.dim(` · watching analysis ${analysisId}`));

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
