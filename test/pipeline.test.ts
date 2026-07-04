import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractJsonObject } from '../src/agents/harness.js';
import { dedupeCandidates } from '../src/explore/deep.js';
import { parseExplorerReport, salvageReportArrays } from '../src/explore/explorer.js';
import { dedupeLeads, loadLeads, makeLead, saveLeads, takeLeads } from '../src/explore/leads.js';
import { ARCHETYPES, assignMissions, type MissionSpec } from '../src/explore/personas.js';
import { isBriefStale, validateBrief, type ProductBrief } from '../src/recon/brief.js';
import { containsSecretValue } from '../src/recon/recon.js';
import { parseTriageReport } from '../src/triage/triage.js';
import { parseVerdict } from '../src/verify/verifier.js';

let tempDirs: string[] = [];

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'autoend-pipeline-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('extractJsonObject', () => {
  it('tolerates prose and fences', () => {
    expect(extractJsonObject('noise ```json\n{"a": 1}\n``` done')).toEqual({ a: 1 });
  });
  it('rejects garbage and bare arrays', () => {
    expect(extractJsonObject('no json here')).toBeUndefined();
    expect(extractJsonObject('{broken')).toBeUndefined();
  });
});

describe('personas', () => {
  const mission = (archetype: MissionSpec['archetype'], goal: string): MissionSpec => ({
    archetype,
    goal,
    surface: 's',
    hypotheses: [],
  });

  it('deals archetypes round-robin so any fleet size stays diverse', () => {
    const assignments = assignMissions(undefined, 7);
    expect(assignments.map((a) => a.archetype)).toEqual([
      ...ARCHETYPES,
      ARCHETYPES[0],
      ARCHETYPES[1],
    ]);
    // No brief — every mission comes from the fallback set.
    expect(assignments.every((a) => a.mission.goal.length > 0)).toBe(true);
  });

  it('consumes brief missions per archetype before falling back', () => {
    const missions = [
      mission('naive-newcomer', 'first'),
      mission('naive-newcomer', 'second'),
      mission('domain-power-user', 'power'),
    ];
    const assignments = assignMissions(missions, 6);
    expect(assignments[0].mission.goal).toBe('first');
    expect(assignments[5].mission.goal).toBe('second'); // sixth explorer is naive again
    expect(assignments[2].mission.goal).toBe('power');
    // Archetypes with no brief mission got fallbacks, not crashes.
    expect(assignments[1].mission.goal.length).toBeGreaterThan(0);
  });
});

describe('product brief', () => {
  const brief: ProductBrief = {
    generatedAt: new Date().toISOString(),
    gitHead: 'aaa',
    product: 'A gadget store',
    users: 'shoppers',
    surfaces: ['catalog'],
    missions: [],
  };

  it('validates and coerces a raw brief, dropping unknown archetypes', () => {
    const parsed = validateBrief({
      product: 'p',
      generatedAt: brief.generatedAt,
      users: 42,
      surfaces: ['a', 3],
      missions: [
        { archetype: 'domain-power-user', goal: 'g', surface: 's', hypotheses: ['h', 1] },
        { archetype: 'growth-hacker', goal: 'g', surface: 's' },
      ],
    });
    expect(parsed?.users).toBe('');
    expect(parsed?.surfaces).toEqual(['a']);
    expect(parsed?.missions).toHaveLength(1);
    expect(parsed?.missions[0].hypotheses).toEqual(['h']);
    expect(validateBrief({ generatedAt: 'x' })).toBeUndefined();
  });

  it('goes stale by age, by head distance, and by unknown distance on moved heads', () => {
    const now = new Date();
    expect(isBriefStale(brief, { now, currentHead: 'aaa' })).toBe(false);
    expect(isBriefStale(brief, { now, currentHead: 'bbb', headDistance: 3 })).toBe(false);
    expect(isBriefStale(brief, { now, currentHead: 'bbb', headDistance: 25 })).toBe(true);
    expect(isBriefStale(brief, { now, currentHead: 'bbb' })).toBe(true);
    const old = { ...brief, generatedAt: new Date(now.getTime() - 15 * 24 * 3600 * 1000).toISOString() };
    expect(isBriefStale(old, { now, currentHead: 'aaa' })).toBe(true);
  });
});

describe('lead ledger', () => {
  it('round-trips, dedupes by hint hash, and takes newest first', async () => {
    const repo = await tempRepo();
    const a = makeLead('the sort order looks wrong', 'power w1', '/products');
    const aDupe = makeLead('The  sort ORDER looks wrong ', 'naive w2');
    const b = makeLead('cart badge did not change', 'prober w1');
    expect(a.id).toBe(aDupe.id); // normalization makes them the same scent

    await saveLeads(repo, dedupeLeads([a, aDupe, b]));
    const loaded = await loadLeads(repo);
    expect(loaded).toHaveLength(2);

    const { taken, rest } = takeLeads(loaded, 1);
    expect(taken[0].id).toBe(b.id); // newest first
    expect(rest.map((l) => l.id)).toEqual([a.id]);
  });

  it('returns empty on a repo without a ledger', async () => {
    expect(await loadLeads(await tempRepo())).toEqual([]);
  });
});

describe('deep explorer report parsing', () => {
  it('parses candidates and leads, and drops candidates without repro steps', () => {
    const report = parseExplorerReport(
      JSON.stringify({
        flows: [],
        findings: [],
        candidates: [
          {
            title: 'Sort by price is alphabetical',
            expectation: 'Prices sort numerically',
            source: 'docs',
            repro: ['1. open /products', '2. click sort'],
            url: '/products?sort=price',
          },
          { title: 'No repro', expectation: 'x', source: 'brief', repro: [] },
          { title: 42 },
        ],
        leads: [{ hint: 'settings page felt unfinished', url: '/settings' }, { nope: true }],
      }),
    );
    expect(report?.candidates).toHaveLength(1);
    expect(report?.candidates?.[0].source).toBe('docs');
    expect(report?.leads).toEqual([{ hint: 'settings page felt unfinished', url: '/settings' }]);
  });

  it('clamps unknown candidate sources to common-sense', () => {
    const report = parseExplorerReport(
      JSON.stringify({
        candidates: [{ title: 't', expectation: 'e', source: 'vibes', repro: ['1. x'] }],
      }),
    );
    expect(report?.candidates?.[0].source).toBe('common-sense');
  });

  it('salvages findings/candidates/leads when a flow script breaks the JSON', () => {
    // The "script" contains a raw backslash-x escape that JSON.parse rejects,
    // so the whole object is unparseable — but the sibling arrays are intact.
    const broken =
      '{ "flows": [{ "id": "a", "title": "A", "script": "bad \\x41 escape" }], ' +
      '"findings": [{ "kind": "hard-failure", "title": "API 500", "detail": "GET /api 500" }], ' +
      '"leads": [{ "hint": "cart badge [1] looked stale" }] }';
    expect(salvageReportArrays(broken)?.findings).toBeDefined();
    const report = parseExplorerReport(broken);
    expect(report?.findings[0].title).toBe('API 500');
    expect(report?.leads).toEqual([{ hint: 'cart badge [1] looked stale', url: undefined }]);
    expect(report?.flows).toEqual([]); // scripts are what broke — never salvaged
  });

  it('dedupes candidates across personas by normalized title', () => {
    const c = (title: string) => ({
      title,
      expectation: 'e',
      source: 'common-sense' as const,
      repro: ['1'],
    });
    expect(dedupeCandidates([c('Sort broken'), c('  sort   BROKEN '), c('Other')])).toHaveLength(2);
  });
});

describe('verifier verdicts', () => {
  it('parses a verdict and rejects non-boolean reproduced', () => {
    expect(parseVerdict('{"reproduced": true, "observed": "saw it", "confidence": 80}')).toEqual({
      reproduced: true,
      observed: 'saw it',
      confidence: 80,
    });
    expect(parseVerdict('{"reproduced": "yes"}')).toBeUndefined();
    expect(parseVerdict(undefined)).toBeUndefined();
  });
});

describe('triage parsing', () => {
  it('parses dispositions and enforces the receipts rule', () => {
    const parsed = parseTriageReport(
      JSON.stringify({
        dispositions: [
          {
            findingId: 'regression-add-to-cart',
            verdict: 'intended-change',
            citations: [{ kind: 'commit', ref: 'abc123', note: 'rename commit' }],
            rationale: 'renamed on purpose',
            confidence: 90,
            rootCause: 'button renamed',
            faultDomain: 'flow',
          },
          {
            findingId: 'no-receipts',
            verdict: 'known-issue',
            citations: [],
            rationale: 'I remember something',
            confidence: 70,
          },
          { findingId: 'weird', verdict: 'catastrophe', confidence: 300 },
        ],
      }),
    );
    expect(parsed.get('regression-add-to-cart')?.disposition.verdict).toBe('intended-change');
    expect(parsed.get('regression-add-to-cart')?.faultDomain).toBe('flow');
    // A history claim without a citation is not evidence (ADR-0008).
    expect(parsed.get('no-receipts')?.disposition.verdict).toBe('unclear');
    expect(parsed.get('weird')?.disposition.verdict).toBe('unclear');
    expect(parsed.get('weird')?.disposition.confidence).toBe(100);
    expect(parsed.get('weird')?.faultDomain).toBe('app');
  });
});

describe('recon secret guard', () => {
  it('refuses briefs that contain secret-looking env values', () => {
    const env = { CURSOR_API_KEY: 'sk-verysecret-123', PATH: '/usr/bin', SHORT_KEY: 'abc' };
    expect(containsSecretValue('the key is sk-verysecret-123 oops', env)).toBe(true);
    expect(containsSecretValue('a clean brief', env)).toBe(false);
    expect(containsSecretValue('/usr/bin appears', env)).toBe(false); // PATH is not secret-named
    expect(containsSecretValue('abc', env)).toBe(false); // too short to match
  });
});
