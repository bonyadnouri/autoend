import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FLOW_SCHEMA_VERSION,
  MAX_RECENT_RUNS,
  addFlow,
  appendRunOutcome,
  healFlow,
  listFlows,
  readFlowScript,
  recordFlowOutcome,
  revertHeal,
  type FlowMeta,
} from '../src/map/flow-map.js';

let tempDirs: string[] = [];

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'autoend-flowmap-'));
  tempDirs.push(dir);
  return dir;
}

const now = () => new Date().toISOString();
const SCRIPT = 'export default async function flow(page, target) { await page.goto(target.href); }';
const HEALED = 'export default async function flow(page, target) { await page.goto(new URL("/v2", target).href); }';

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('listFlows robustness (#2)', () => {
  it('skips malformed flow directories instead of throwing', async () => {
    const repo = await tempRepo();
    await addFlow(repo, { id: 'good', title: 'A good flow', discoveredAt: now() }, SCRIPT);

    // directory with no flow.json at all
    await mkdir(join(repo, '.autoend', 'flows', 'no-json'), { recursive: true });
    // directory with corrupt JSON
    await mkdir(join(repo, '.autoend', 'flows', 'corrupt'), { recursive: true });
    await writeFile(join(repo, '.autoend', 'flows', 'corrupt', 'flow.json'), '{ not valid json');
    // directory whose flow.json is missing required fields
    await mkdir(join(repo, '.autoend', 'flows', 'incomplete'), { recursive: true });
    await writeFile(join(repo, '.autoend', 'flows', 'incomplete', 'flow.json'), JSON.stringify({ title: 'no id' }));

    const flows = await listFlows(repo);
    expect(flows.map((f) => f.id)).toEqual(['good']);
  });

  it('skips a flow whose json id does not match its directory name', async () => {
    const repo = await tempRepo();
    await addFlow(repo, { id: 'good', title: 'A good flow', discoveredAt: now() }, SCRIPT);
    // A human edit / merge conflict left the id disagreeing with the folder.
    await mkdir(join(repo, '.autoend', 'flows', 'renamed'), { recursive: true });
    await writeFile(
      join(repo, '.autoend', 'flows', 'renamed', 'flow.json'),
      JSON.stringify({ id: 'different', title: 'Drifted', discoveredAt: now() }),
    );
    await writeFile(join(repo, '.autoend', 'flows', 'renamed', 'flow.mts'), SCRIPT);

    const flows = await listFlows(repo);
    expect(flows.map((f) => f.id)).toEqual(['good']);
  });

  it('skips a flow missing the required discoveredAt field', async () => {
    const repo = await tempRepo();
    await mkdir(join(repo, '.autoend', 'flows', 'no-date'), { recursive: true });
    await writeFile(
      join(repo, '.autoend', 'flows', 'no-date', 'flow.json'),
      JSON.stringify({ id: 'no-date', title: 'No timestamp' }),
    );
    expect(await listFlows(repo)).toEqual([]);
  });

  it('returns an empty list on a repo with no map', async () => {
    expect(await listFlows(await tempRepo())).toEqual([]);
  });
});

describe('flow schema (#10)', () => {
  it('stamps the current schema version when writing', async () => {
    const repo = await tempRepo();
    await addFlow(repo, { id: 'versioned', title: 'Versioned', discoveredAt: now() }, SCRIPT);
    const [meta] = await listFlows(repo);
    expect(meta.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
  });

  it('always stamps the current schema version, overriding a stale one', async () => {
    const repo = await tempRepo();
    const stale = { id: 'stale', title: 'Stale', discoveredAt: now(), schemaVersion: 0 } as FlowMeta;
    await addFlow(repo, stale, SCRIPT);
    const [meta] = await listFlows(repo);
    expect(meta.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
  });

  it('healFlow retains the pre-heal script and overwrites flow.mts', async () => {
    const repo = await tempRepo();
    const meta: FlowMeta = { id: 'checkout', title: 'Checkout', discoveredAt: now() };
    await addFlow(repo, meta, SCRIPT);

    const healed = await healFlow(repo, meta, HEALED, 'run-42');

    expect(healed.heal?.previousScript).toBe(SCRIPT);
    expect(healed.heal?.healedInRun).toBe('run-42');
    expect(healed.heal?.healedAt).toBeTypeOf('string');
    expect(await readFlowScript(repo, 'checkout')).toBe(HEALED);

    const [persisted] = await listFlows(repo);
    expect(persisted.heal?.previousScript).toBe(SCRIPT);
  });

  it('revertHeal restores the pre-heal script and clears the heal record', async () => {
    const repo = await tempRepo();
    const meta: FlowMeta = { id: 'checkout', title: 'Checkout', discoveredAt: now() };
    await addFlow(repo, meta, SCRIPT);
    const healed = await healFlow(repo, meta, HEALED);

    const reverted = await revertHeal(repo, healed);

    expect(reverted.heal).toBeUndefined();
    expect(await readFlowScript(repo, 'checkout')).toBe(SCRIPT);
    const [persisted] = await listFlows(repo);
    expect(persisted.heal).toBeUndefined();
  });

  it('revertHeal throws when there is no Heal to revert', async () => {
    const repo = await tempRepo();
    const meta: FlowMeta = { id: 'checkout', title: 'Checkout', discoveredAt: now() };
    await addFlow(repo, meta, SCRIPT);
    await expect(revertHeal(repo, meta)).rejects.toThrow(/no Heal to revert/);
  });
});

describe('flow run history (#14)', () => {
  it('appendRunOutcome caps recentRuns at MAX_RECENT_RUNS', () => {
    let meta: FlowMeta = { id: 'f', title: 'F', discoveredAt: now() };
    for (let i = 0; i < MAX_RECENT_RUNS + 5; i += 1) {
      meta = appendRunOutcome(meta, `run-${i}`, i % 2 === 0);
    }
    expect(meta.recentRuns).toHaveLength(MAX_RECENT_RUNS);
    expect(meta.recentRuns![0].runId).toBe('run-5');
    expect(meta.recentRuns!.at(-1)?.runId).toBe(`run-${MAX_RECENT_RUNS + 4}`);
  });

  it('recordFlowOutcome writes lastFailedAt on failure', async () => {
    const repo = await tempRepo();
    const meta: FlowMeta = { id: 'checkout', title: 'Checkout', discoveredAt: now() };
    await addFlow(repo, meta, SCRIPT);

    const updated = await recordFlowOutcome(repo, meta, 'run-fail', false);

    expect(updated.lastFailedAt).toBeTypeOf('string');
    expect(updated.lastPassedAt).toBeUndefined();
    expect(updated.recentRuns).toEqual([{ runId: 'run-fail', passed: false }]);
    const [persisted] = await listFlows(repo);
    expect(persisted.lastFailedAt).toBe(updated.lastFailedAt);
  });

  it('recordFlowOutcome writes lastPassedAt and appends on success', async () => {
    const repo = await tempRepo();
    const meta: FlowMeta = { id: 'checkout', title: 'Checkout', discoveredAt: now() };
    await addFlow(repo, meta, SCRIPT);

    const updated = await recordFlowOutcome(repo, meta, 'run-pass', true);

    expect(updated.lastPassedAt).toBeTypeOf('string');
    expect(updated.recentRuns).toEqual([{ runId: 'run-pass', passed: true }]);
  });

  it('upgrades legacy flow.json without new fields on next replay write', async () => {
    const repo = await tempRepo();
    await mkdir(join(repo, '.autoend', 'flows', 'legacy'), { recursive: true });
    await writeFile(
      join(repo, '.autoend', 'flows', 'legacy', 'flow.json'),
      JSON.stringify({ id: 'legacy', title: 'Legacy', discoveredAt: now() }),
    );
    await writeFile(join(repo, '.autoend', 'flows', 'legacy', 'flow.mts'), SCRIPT);

    const [loaded] = await listFlows(repo);
    const upgraded = await recordFlowOutcome(repo, loaded, 'run-upgrade', true);

    expect(upgraded.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(upgraded.recentRuns).toEqual([{ runId: 'run-upgrade', passed: true }]);
    const raw = JSON.parse(await readFile(join(repo, '.autoend', 'flows', 'legacy', 'flow.json'), 'utf8'));
    expect(raw.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
  });

  it('addFlow with discoveredInRun and initial recentRuns persists them', async () => {
    const repo = await tempRepo();
    const ts = now();
    const meta = appendRunOutcome(
      { id: 'new', title: 'New flow', discoveredAt: ts, discoveredInRun: 'run-discover' },
      'run-discover',
      true,
    );
    await addFlow(repo, meta, SCRIPT);
    const [persisted] = await listFlows(repo);
    expect(persisted.discoveredInRun).toBe('run-discover');
    expect(persisted.recentRuns).toEqual([{ runId: 'run-discover', passed: true }]);
  });
});
