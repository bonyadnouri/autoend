import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunArtifact } from '../src/report/types.js';

// Shared mock state must be hoisted so the vi.mock factory can reference it.
const h = vi.hoisted(() => {
  const ops: Array<{ op: string; table: string; obj?: unknown; pruned?: boolean }> = [];
  const inserted: Record<string, unknown[]> = {};
  const state = {
    existingAnalysis: null as null | { id: string },
    failUpsertOn: null as null | string,
    uploaded: [] as string[],
    removed: [] as string[],
  };

  // A delete builder that is awaitable and supports .eq().not() chaining.
  const deleteQuery = (table: string) => {
    const record: { op: string; table: string; pruned?: boolean } = { op: 'delete', table };
    ops.push(record);
    const q: Record<string, unknown> = {
      eq: () => q,
      not: () => {
        record.pruned = true;
        return q;
      },
      then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return q;
  };

  const makeClient = () => ({
    from(table: string) {
      return {
        upsert(rows: unknown) {
          ops.push({ op: 'upsert', table });
          inserted[table] = Array.isArray(rows) ? rows : [rows];
          const error = state.failUpsertOn === table ? { message: 'simulated upsert failure' } : null;
          return Promise.resolve({ error });
        },
        insert(rows: unknown) {
          ops.push({ op: 'insert', table });
          inserted[table] = Array.isArray(rows) ? rows : [rows];
          return Promise.resolve({ error: null });
        },
        delete() {
          return deleteQuery(table);
        },
        update(obj: unknown) {
          return {
            eq() {
              ops.push({ op: 'update', table, obj });
              return Promise.resolve({ error: null });
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: state.existingAnalysis, error: null });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      getBucket: () => Promise.resolve({ data: { name: 'evidence' }, error: null }),
      createBucket: () => Promise.resolve({ error: null }),
      from() {
        return {
          upload(path: string) {
            state.uploaded.push(path);
            return Promise.resolve({ error: null });
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.example/${path}` } };
          },
          list() {
            return Promise.resolve({ data: [], error: null });
          },
          remove(paths: string[]) {
            state.removed.push(...paths);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  });

  return { ops, inserted, state, makeClient };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.makeClient() }));

// Imported after the mock is registered.
const { publishRun } = await import('../src/publish/publish.js');

const NO_EVIDENCE_DIR = '/tmp/autoend-publish-test-no-evidence-xyz';
let tempDirs: string[] = [];

async function evidenceDirWith(files: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'autoend-evidence-'));
  tempDirs.push(dir);
  await Promise.all(files.map((f) => writeFile(join(dir, f), 'x')));
  return dir;
}

function makeArtifact(): RunArtifact {
  return {
    runId: 'run-1',
    target: 'https://demo.example.com/',
    effort: 'mid',
    startedAt: '2026-07-04T10:00:00.000Z',
    finishedAt: '2026-07-04T10:01:00.000Z',
    flowsReplayed: 2,
    flowsDiscovered: 1,
    flows: [
      { id: 'login', title: 'Login', status: 'passed', discoveredAt: '', durationMs: 1200,
        timeline: [{ label: 'goto /login', status: 'passed', tMs: 0 }] },
      { id: 'checkout', title: 'Checkout', status: 'failed', discoveredAt: '', durationMs: 3400,
        evidence: 'checkout.webm' },
      { id: 'wishlist', title: 'Wishlist', status: 'discovered', discoveredAt: '' },
    ],
    environment: {
      browser: 'Chromium 149',
      viewport: '1280×720',
      os: 'darwin 23.6',
      node: 'v22',
      autoendVersion: '0.1.1',
    },
    findings: [
      {
        id: 'reg-1',
        kind: 'regression',
        flowId: 'checkout',
        title: 'Checkout no longer completes',
        detail: 'Payment step throws.',
        evidence: 'checkout.webm',
        diagnosis: { rootCause: 'Null cart id', faultDomain: 'app', confidence: 82 },
        console: [{ level: 'error', text: 'TypeError: cart is null', tMs: 900 }],
        network: [{ method: 'post', url: '/api/pay', status: 500, tMs: 850 }],
        timeline: [{ label: 'click Pay', status: 'failed', tMs: 800 }],
        screenshots: [{ file: 'shot.png', label: 'at-failure', tMs: 800 }],
      },
      {
        id: 'adv-1',
        kind: 'advisory',
        title: 'Deprecated API on pricing page',
        detail: 'Console warning.',
      },
    ],
    heals: [],
  };
}

/** A Defect Finding: reproduced semantic bug with video Evidence, but no Flow. */
function defectFinding() {
  return {
    id: 'defect-0',
    kind: 'defect' as const,
    title: 'Cart total ignores quantity',
    detail: 'Expected: total = price × qty\nObserved: total = price',
    evidence: 'defect-0.webm',
    expectation: { statement: 'Total reflects quantity', source: 'common-sense' as const },
    screenshots: [{ file: 'defect-0-at-failure.png', label: 'at-failure' as const, tMs: 500 }],
  };
}

beforeEach(() => {
  h.ops.length = 0;
  for (const key of Object.keys(h.inserted)) delete h.inserted[key];
  h.state.existingAnalysis = null;
  h.state.failUpsertOn = null;
  h.state.uploaded = [];
  h.state.removed = [];
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('publishRun', () => {
  it('skips cleanly when Supabase is not configured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    const result = await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    expect(result).toEqual({ skipped: true, tests: 0, issues: 0, investigations: 0 });
    expect(h.ops).toHaveLength(0);
  });

  it('maps flows to tests with the UI status vocabulary', async () => {
    await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    const tests = h.inserted.tests as Array<Record<string, unknown>>;
    expect(tests).toHaveLength(3);
    const byId = Object.fromEntries(tests.map((t) => [t.id, t]));
    expect(byId.login.status).toBe('pass');
    expect(byId.checkout.status).toBe('fail');
    // A 'discovered' flow was verified by running it, so it publishes as a pass.
    expect(byId.wishlist.status).toBe('pass');
    expect(byId.checkout.related_issue_ids).toEqual(['reg-1']);
    expect(byId.checkout.has_investigation).toBe(true);
    expect(byId.login.has_investigation).toBe(false);
    expect(byId.login.steps).toEqual([{ action: 'goto /login', expected: 'Step succeeds' }]);
  });

  it('maps findings to issues, linking each to its subject test', async () => {
    await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    const issues = h.inserted.issues as Array<Record<string, unknown>>;
    expect(issues).toHaveLength(2);
    const byId = Object.fromEntries(issues.map((i) => [i.id, i]));
    expect(byId['reg-1'].severity).toBe('high');
    expect(byId['reg-1'].suggested_fix).toBe('Null cart id');
    // Regression links to its flow; advisory (no flow) links to its own subject id.
    expect(byId['reg-1'].related_test_ids).toEqual(['checkout']);
    expect(byId['adv-1'].severity).toBe('low');
    expect(byId['adv-1'].related_test_ids).toEqual(['adv-1']);
  });

  it('builds one investigation per detailed finding with mapped runtime data', async () => {
    await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    const inv = h.inserted.investigations as Array<Record<string, any>>;
    // reg-1 has detail; adv-1 has none -> one investigation (checkout).
    expect(inv).toHaveLength(1);
    const payload = inv[0].payload;
    expect(inv[0].test_id).toBe('checkout');
    expect(payload.analysis.faultDomain).toBe('frontend');
    expect(payload.analysis.confidence).toBe(82);
    expect(payload.logs[0]).toMatchObject({ level: 'error', source: 'console', message: 'TypeError: cart is null' });
    expect(payload.network[0]).toMatchObject({ method: 'POST', endpoint: '/api/pay', status: 500, failed: true });
    expect(payload.timeline[0]).toMatchObject({ label: 'click Pay', kind: 'failure' });
    expect(payload.evidence[0]).toMatchObject({ label: 'At failure', imageUrl: null });
    expect(payload.replay.videoUrl).toBeNull();
  });

  it('N2: a Flow-less Defect keeps a synthetic test, issue link, and video investigation', async () => {
    const artifact = makeArtifact();
    artifact.findings = [defectFinding()];
    const evidenceDir = await evidenceDirWith(['defect-0.webm', 'defect-0-at-failure.png']);

    await publishRun(artifact, evidenceDir);

    // A synthetic test row exists for the defect so the UI can reach its video.
    const tests = h.inserted.tests as Array<Record<string, unknown>>;
    const defectTest = tests.find((t) => t.id === 'defect-0');
    expect(defectTest).toBeDefined();
    expect(defectTest!.status).toBe('fail');
    expect(defectTest!.has_investigation).toBe(true);
    expect(defectTest!.expected_result).toBe('Total reflects quantity');

    // The issue links to that subject test.
    const issues = h.inserted.issues as Array<Record<string, unknown>>;
    expect(issues.find((i) => i.id === 'defect-0')!.related_test_ids).toEqual(['defect-0']);

    // The investigation is keyed by the finding id and carries the hosted video.
    const inv = h.inserted.investigations as Array<Record<string, any>>;
    const defectInv = inv.find((r) => r.test_id === 'defect-0');
    expect(defectInv).toBeDefined();
    expect(defectInv.payload.replay.videoUrl).toBe('https://cdn.example/run-1/defect-0.webm');
    expect(defectInv.payload.evidence[0].imageUrl).toBe('https://cdn.example/run-1/defect-0-at-failure.png');
  });

  it('N3: upserts before pruning for every child table (no empty-analysis window)', async () => {
    await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    for (const table of ['tests', 'issues', 'investigations']) {
      const upsertAt = h.ops.findIndex((o) => o.op === 'upsert' && o.table === table);
      const deleteAt = h.ops.findIndex((o) => o.op === 'delete' && o.table === table);
      expect(upsertAt).toBeGreaterThanOrEqual(0);
      expect(deleteAt).toBeGreaterThan(upsertAt);
    }
    // The stale-prune delete is scoped (analysis + id-not-in), not a blind wipe.
    expect(h.ops.find((o) => o.op === 'delete' && o.table === 'tests')!.pruned).toBe(true);
    // Analyses summary is written last as the commit marker.
    const analysisIndex = h.ops.findIndex((o) => o.table === 'analyses');
    const childInserts = h.ops
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => ['tests', 'issues', 'investigations'].includes(o.table) && o.op === 'upsert')
      .map(({ i }) => i);
    expect(analysisIndex).toBeGreaterThan(Math.max(...childInserts));
  });

  it('N3: a failed upsert never prunes the previous run (throws before delete)', async () => {
    // Fail the first table publishRun writes (journeys) so the very first upsert
    // throws before any delete runs anywhere — replaceRows upserts before it prunes.
    h.state.failUpsertOn = 'journeys';
    await expect(publishRun(makeArtifact(), NO_EVIDENCE_DIR)).rejects.toThrow(/upsert journeys/);
    expect(h.ops.some((o) => o.op === 'delete')).toBe(false);
  });

  it('reports counts and updates (not inserts) the analyses row when it exists', async () => {
    h.state.existingAnalysis = { id: 'shopflow-default' };
    const result = await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    expect(result).toEqual({ skipped: false, tests: 3, issues: 2, investigations: 1 });
    expect(h.inserted.analyses).toBeUndefined();
    const update = h.ops.find((o) => o.table === 'analyses' && o.op === 'update');
    expect(update?.obj).toMatchObject({ user_flows: 3, tests_passed: 2 });
  });
});
