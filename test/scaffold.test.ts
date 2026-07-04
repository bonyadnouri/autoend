import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addFlow, listFlows } from '../src/map/flow-map.js';
import { prepareRunDir, readRunArtifact, writeReport } from '../src/report/artifact.js';
import { EFFORT_LEVELS, EFFORT_PIPELINES, isEffort } from '../src/run/effort.js';
import type { RunArtifact } from '../src/report/types.js';

let tempDirs: string[] = [];

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'autoend-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('effort', () => {
  it('has five levels with monotonically increasing budgets', () => {
    expect(EFFORT_LEVELS).toHaveLength(5);
    for (let i = 1; i < EFFORT_LEVELS.length; i++) {
      const prev = EFFORT_PIPELINES[EFFORT_LEVELS[i - 1]];
      const next = EFFORT_PIPELINES[EFFORT_LEVELS[i]];
      expect(next.seconds).toBeGreaterThan(prev.seconds);
      expect(next.explorers).toBeGreaterThanOrEqual(prev.explorers);
    }
  });

  it('keeps low/mid on the smoke path and unlocks deep stages from high (ADR-0007)', () => {
    expect(EFFORT_PIPELINES.low.kind).toBe('smoke');
    expect(EFFORT_PIPELINES.mid.kind).toBe('smoke');
    for (const effort of ['high', 'xhigh', 'ultra'] as const) {
      const shape = EFFORT_PIPELINES[effort];
      expect(shape.kind).toBe('deep');
      expect(shape.recon && shape.verifier && shape.triage).toBe(true);
    }
    // Wave two is lead-seeded and exists only at xhigh/ultra (CONTEXT.md: Wave).
    expect(EFFORT_PIPELINES.high.waves).toBe(1);
    expect(EFFORT_PIPELINES.xhigh.waves).toBe(2);
    expect(EFFORT_PIPELINES.ultra.waves).toBe(2);
  });

  it('validates effort strings', () => {
    expect(isEffort('ultra')).toBe(true);
    expect(isEffort('turbo')).toBe(false);
  });
});

describe('run artifact', () => {
  it('round-trips report.json', async () => {
    const repo = await tempRepo();
    const artifact: RunArtifact = {
      runId: 'run-1',
      target: 'https://example.com/',
      effort: 'low',
      startedAt: new Date().toISOString(),
      flowsReplayed: 0,
      flowsDiscovered: 0,
      flows: [],
      environment: {
        browser: 'Chromium (not launched)',
        viewport: '1280×720',
        os: 'linux 6.0.0',
        node: 'v23.6.0',
        autoendVersion: '0.0.0',
      },
      findings: [],
      heals: [],
    };
    const { dir } = await prepareRunDir(repo, artifact.runId);
    await writeReport(dir, artifact);
    expect(await readRunArtifact(dir)).toEqual(artifact);
  });
});

describe('flow map', () => {
  it('is empty on a repo with no map', async () => {
    expect(await listFlows(await tempRepo())).toEqual([]);
  });

  it('lists added flows', async () => {
    const repo = await tempRepo();
    await addFlow(
      repo,
      { id: 'checkout', title: 'A shopper completes checkout', discoveredAt: new Date().toISOString() },
      '// playwright script placeholder\n',
    );
    const flows = await listFlows(repo);
    expect(flows).toHaveLength(1);
    expect(flows[0].id).toBe('checkout');
  });
});
