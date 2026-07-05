import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createCalls: [] as Array<{ spec: { envVars: Record<string, string> }; config: unknown }>,
  streamCalls: [] as Array<{ prompt: string; envVars: Record<string, string> }>,
  downloadCalls: [] as string[],
  disposed: false,
}));

vi.mock('@hack-raise/cursor-cloud-sidearm', async () => {
  const actual = await vi.importActual<typeof import('@hack-raise/cursor-cloud-sidearm')>(
    '@hack-raise/cursor-cloud-sidearm'
  );
  const fakeAgent = {
    agentId: 'agent-1',
    async [Symbol.asyncDispose]() {
      state.disposed = true;
    },
  };
  return {
    ...actual,
    resolveModelId: vi.fn(async () => 'composer-2.5'),
    createCloudAgent: vi.fn(async (spec: { envVars: Record<string, string> }, config: unknown) => {
      state.createCalls.push({ spec, config });
      return { agent: fakeAgent, profile: 'cloud-env' as const };
    }),
    streamCloudRun: vi.fn(async (_agent: unknown, prompt: string, envVars: Record<string, string>) => {
      state.streamCalls.push({ prompt, envVars });
      return { result: { status: 'finished' as const, result: 'all clear' }, transcript: 'hello world' };
    }),
    downloadCloudArtifacts: vi.fn(async (_agent: unknown, destDir: string) => {
      state.downloadCalls.push(destDir);
      return { dir: destDir, savedPaths: [] };
    }),
  };
});

const { runAutoendCloud } = await import('../src/cloud/run.js');

describe('runAutoendCloud', () => {
  let repoRoot: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'autoend-cloud-run-'));
    state.createCalls.length = 0;
    state.streamCalls.length = 0;
    state.downloadCalls.length = 0;
    state.disposed = false;
    process.env.CURSOR_API_KEY = 'test-key';
    process.env.CURSOR_CLOUD_ENV_NAME = 'test-env';
    delete process.env.CURSOR_REPO_URL;
    delete process.env.AUTOEND_PROFILE;
    delete process.env.AUTOEND_RUN_ID;
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('throws without CURSOR_API_KEY', async () => {
    delete process.env.CURSOR_API_KEY;
    await expect(
      runAutoendCloud({ repoRoot, target: 'https://staging.example.com', effort: 'low' })
    ).rejects.toThrow(/CURSOR_API_KEY is required/);
  });

  it('throws on a local-dev profile (no CURSOR_REPO_URL/CURSOR_CLOUD_ENV_NAME)', async () => {
    delete process.env.CURSOR_CLOUD_ENV_NAME;
    await expect(
      runAutoendCloud({ repoRoot, target: 'https://staging.example.com', effort: 'low' })
    ).rejects.toThrow(/requires a cloud profile/);
  });

  it('rejects an unknown effort before ever creating a cloud agent', async () => {
    await expect(
      runAutoendCloud({ repoRoot, target: 'https://staging.example.com', effort: 'extreme' })
    ).rejects.toThrow(/Unknown autoend effort/);
    expect(state.createCalls).toHaveLength(0);
  });

  it('launches a cloud agent with a safe, non-secret env contract', async () => {
    const outcome = await runAutoendCloud({ repoRoot, target: 'https://staging.example.com', effort: 'low' });

    expect(outcome.agentId).toBe('agent-1');
    expect(outcome.profile).toBe('cloud-env');
    expect(outcome.status).toBe('finished');
    expect(outcome.resultText).toBe('all clear');
    expect(state.disposed).toBe(true);

    expect(state.createCalls).toHaveLength(1);
    const { envVars } = state.createCalls[0].spec;
    expect(envVars).toEqual({
      AUTOEND_RUN_ID: outcome.runId,
      AUTOEND_TARGET: 'https://staging.example.com',
      AUTOEND_EFFORT: 'low',
      AUTOEND_NO_SERVE: '1',
    });
  });

  it('downloads cloud artifacts and persists a redacted transcript locally', async () => {
    const outcome = await runAutoendCloud({ repoRoot, target: 'https://staging.example.com', effort: 'low' });

    expect(state.downloadCalls).toEqual([outcome.cloudArtifactsDir]);
    expect(outcome.cloudArtifactsDir).toBe(join(repoRoot, '.autoend', 'cloud-artifacts', outcome.runId));
    expect(outcome.transcriptPath).toBe(join(repoRoot, '.autoend', 'cloud-runs', outcome.runId, 'agent-1-transcript.txt'));
    expect(await readFile(outcome.transcriptPath, 'utf8')).toBe('hello world');
  });

  it('respects an explicit runId override', async () => {
    const outcome = await runAutoendCloud({
      repoRoot,
      target: 'https://staging.example.com',
      effort: 'low',
      runId: 'fixed-run-id',
    });
    expect(outcome.runId).toBe('fixed-run-id');
  });

  it('forwards optional artifactDir and flowSyncMode into the env contract', async () => {
    await runAutoendCloud({
      repoRoot,
      target: 'https://staging.example.com',
      effort: 'mid',
      artifactDir: '.autoend/cloud-runs-custom',
      flowSyncMode: 'none',
    });
    const { envVars } = state.createCalls[0].spec;
    expect(envVars.AUTOEND_ARTIFACT_DIR).toBe('.autoend/cloud-runs-custom');
    expect(envVars.AUTOEND_FLOW_SYNC_MODE).toBe('none');
  });
});
