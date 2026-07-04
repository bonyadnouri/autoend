import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunArtifact } from '../src/report/types.js';

// Shared mock state must be hoisted so the vi.mock factory can reference it.
const h = vi.hoisted(() => {
  const ops: Array<{ op: string; table: string; obj?: unknown }> = [];
  const inserted: Record<string, unknown[]> = {};
  const state = { existingAnalysis: null as null | { id: string } };

  const makeClient = () => ({
    from(table: string) {
      return {
        delete() {
          return {
            eq() {
              ops.push({ op: 'delete', table });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(rows: unknown) {
          ops.push({ op: 'insert', table });
          inserted[table] = Array.isArray(rows) ? rows : [rows];
          return Promise.resolve({ error: null });
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
    storage: { getBucket: vi.fn(), createBucket: vi.fn(), from: vi.fn() },
  });

  return { ops, inserted, state, makeClient };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.makeClient() }));

// Imported after the mock is registered.
const { publishRun } = await import('../src/publish/publish.js');

const NO_EVIDENCE_DIR = '/tmp/autoend-publish-test-no-evidence-xyz';

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

beforeEach(() => {
  h.ops.length = 0;
  for (const key of Object.keys(h.inserted)) delete h.inserted[key];
  h.state.existingAnalysis = null;
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
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
    expect(byId.wishlist.status).toBe('not-executed');
    expect(byId.checkout.related_issue_ids).toEqual(['reg-1']);
    expect(byId.checkout.has_investigation).toBe(true);
    expect(byId.login.has_investigation).toBe(false);
    expect(byId.login.steps).toEqual([{ action: 'goto /login', expected: 'Step succeeds' }]);
  });

  it('maps findings to issues with severity by tier', async () => {
    await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    const issues = h.inserted.issues as Array<Record<string, unknown>>;
    expect(issues).toHaveLength(2);
    const byId = Object.fromEntries(issues.map((i) => [i.id, i]));
    expect(byId['reg-1'].severity).toBe('high');
    expect(byId['reg-1'].suggested_fix).toBe('Null cart id');
    expect(byId['reg-1'].related_test_ids).toEqual(['checkout']);
    expect(byId['adv-1'].severity).toBe('low');
    expect(byId['adv-1'].related_test_ids).toEqual([]);
  });

  it('builds one investigation per detailed flow with mapped runtime data', async () => {
    await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    const inv = h.inserted.investigations as Array<Record<string, any>>;
    expect(inv).toHaveLength(1);
    const payload = inv[0].payload;
    expect(inv[0].test_id).toBe('checkout');
    expect(payload.analysis.faultDomain).toBe('frontend');
    expect(payload.analysis.confidence).toBe(82);
    expect(payload.logs[0]).toMatchObject({ level: 'error', source: 'console', message: 'TypeError: cart is null' });
    expect(payload.network[0]).toMatchObject({ method: 'POST', endpoint: '/api/pay', status: 500, failed: true });
    expect(payload.timeline[0]).toMatchObject({ label: 'click Pay', kind: 'failure' });
    expect(payload.evidence[0]).toMatchObject({ label: 'At failure', imageUrl: null });
    // No evidence uploaded (empty dir) -> no playable video/screenshot, UI falls back.
    expect(payload.replay.videoUrl).toBeNull();
  });

  it('writes the analyses summary last as the commit marker', async () => {
    const result = await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    expect(result).toEqual({ skipped: false, tests: 3, issues: 2, investigations: 1 });

    const analysisIndex = h.ops.findIndex((o) => o.table === 'analyses');
    const childIndices = h.ops
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => ['tests', 'issues', 'investigations'].includes(o.table) && o.op === 'insert')
      .map(({ i }) => i);
    expect(analysisIndex).toBeGreaterThan(Math.max(...childIndices));

    // Deletes precede inserts for each child table.
    const firstInsert = h.ops.findIndex((o) => o.op === 'insert');
    const lastDelete = h.ops.map((o) => o.op).lastIndexOf('delete');
    expect(lastDelete).toBeLessThan(firstInsert);

    const summary = h.ops.find((o) => o.table === 'analyses')?.obj as Record<string, unknown> | undefined;
    // existingAnalysis is null -> row inserted with mock defaults preserved elsewhere.
    const analysisRow = (h.inserted.analyses as Array<Record<string, unknown>>)[0];
    expect(analysisRow).toMatchObject({
      id: 'shopflow-default',
      app_url: 'https://demo.example.com/',
      user_flows: 3,
      tests_passed: 1,
      tests_failed: 1,
      tests_not_executed: 1,
      critical_issues: 0,
    });
    expect(summary).toBeUndefined(); // inserted (not updated) when the row is absent
  });

  it('updates (not inserts) the analyses row when it already exists', async () => {
    h.state.existingAnalysis = { id: 'shopflow-default' };
    await publishRun(makeArtifact(), NO_EVIDENCE_DIR);
    expect(h.inserted.analyses).toBeUndefined();
    const update = h.ops.find((o) => o.table === 'analyses' && o.op === 'update');
    expect(update?.obj).toMatchObject({ user_flows: 3, tests_passed: 1 });
  });
});
