import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listFlows } from '../map/flow-map.js';
import { publishRun } from '../publish/publish.js';
import { replayFlowMap } from '../replay/replay.js';
import { prepareRunDir, writeReport } from '../report/artifact.js';
import type { RunArtifact } from '../report/types.js';
import type { RunKind, RunReporter } from '../stream/reporter.js';
import type { Effort } from '../run/effort.js';

async function autoendVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export interface SingleTestOptions {
  repoRoot: string;
  target: URL;
  runId: string;
  testId: string;
  reporter: RunReporter;
  effort: Effort;
  kind: RunKind;
}

/** Replay one flow from the Flow Map; skips exploration. */
export async function executeSingleTestRun(opts: SingleTestOptions): Promise<{ artifactDir: string; artifact: RunArtifact }> {
  const startedAt = new Date().toISOString();
  const { dir, evidenceDir } = await prepareRunDir(opts.repoRoot, opts.runId);
  const flows = (await listFlows(opts.repoRoot)).filter((f) => f.id === opts.testId);
  if (flows.length === 0) {
    throw new Error(`flow "${opts.testId}" not found in Flow Map`);
  }

  await opts.reporter.runStarted({
    runId: opts.runId,
    target: opts.target.href,
    effort: opts.effort,
    kind: opts.kind,
  });

  try {
    const replay = await replayFlowMap(opts.repoRoot, opts.target, flows, evidenceDir, { reporter: opts.reporter });

    const artifact: RunArtifact = {
      runId: opts.runId,
      target: opts.target.href,
      effort: opts.effort,
      startedAt,
      finishedAt: new Date().toISOString(),
      flowsReplayed: replay.replayed,
      flowsDiscovered: 0,
      flows: replay.flows,
      environment: {
        browser: replay.browserVersion ? `Chromium ${replay.browserVersion}` : 'Chromium',
        viewport: '1280×720',
        os: process.platform,
        node: process.version,
        autoendVersion: await autoendVersion(),
      },
      findings: replay.findings,
      heals: replay.heals,
    };
    await writeReport(dir, artifact);
    await opts.reporter.runFinished({
      runId: opts.runId,
      status: 'finished',
      flowsReplayed: replay.replayed,
      flowsDiscovered: 0,
      findingCounts: replay.findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.kind] = (acc[f.kind] ?? 0) + 1;
        return acc;
      }, {}),
    });
    return { artifactDir: dir, artifact };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await opts.reporter.runFinished({ runId: opts.runId, status: 'failed', error: message });
    throw error;
  }
}

export async function publishSingleTestArtifact(
  artifactDir: string,
  artifact: RunArtifact,
  analysisId?: string,
): Promise<void> {
  await publishRun(artifact, join(artifactDir, 'evidence'), analysisId);
}
