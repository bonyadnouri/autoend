import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FLOW_SCHEMA_VERSION,
  addFlow,
  healFlow,
  listFlows,
  readFlowScript,
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
