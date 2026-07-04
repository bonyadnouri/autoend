import { describe, expect, it } from 'vitest';
import { matchesEntry, scoreDiscovery, scoreDispositions, type TruthEntry } from '../bench/score.js';
import type { Finding } from '../src/report/types.js';

// Pure scoring tests — no server, no LLM.

const TRUTH: TruthEntry[] = [
  {
    id: 'sort-lexicographic',
    bug: 'sort-lexicographic',
    expectKind: ['defect', 'advisory'],
    match: { all: ['sort'], any: ['price', 'order'] },
    description: 'price sort is lexicographic',
  },
  {
    id: 'deals-500',
    bug: 'deals-500',
    expectKind: ['hard-failure', 'advisory'],
    match: { all: ['deal'], any: ['500', 'error'] },
    description: 'deals endpoint 500s',
  },
];

function finding(overrides: Partial<Finding> & Pick<Finding, 'id' | 'kind'>): Finding {
  return { title: '', detail: '', ...overrides };
}

describe('matchesEntry', () => {
  const entry = TRUTH[0];
  it('requires every "all" term and at least one "any" term', () => {
    expect(matchesEntry(finding({ id: 'a', kind: 'defect', title: 'Sort by price is wrong' }), entry)).toBe(true);
    // has "sort" but no "any" term (price/order)
    expect(matchesEntry(finding({ id: 'b', kind: 'defect', title: 'Sort direction toggles' }), entry)).toBe(false);
    // has an "any" term but not the "all" term
    expect(matchesEntry(finding({ id: 'c', kind: 'defect', title: 'Price is missing' }), entry)).toBe(false);
  });

  it('matches across title and detail, case-insensitively', () => {
    const f = finding({ id: 'd', kind: 'defect', title: 'Catalog', detail: 'SORTING by PRICE is off' });
    expect(matchesEntry(f, entry)).toBe(true);
  });
});

describe('scoreDiscovery', () => {
  const seeded = new Set(['sort-lexicographic']);

  it('detects a seeded bug when a matching Finding has an expected kind', () => {
    const findings = [finding({ id: 'x', kind: 'defect', title: 'Sort by price broken', detail: 'lexicographic order' })];
    const score = scoreDiscovery(findings, TRUTH, seeded);
    expect(score.detected).toEqual(['sort-lexicographic']);
    expect(score.missed).toEqual([]);
    expect(score.falseDefects).toEqual([]);
    expect(score.findingsTotal).toBe(1);
  });

  it('does not detect when the Finding kind is outside expectKind', () => {
    // Matches the substrings but kind "regression" is not in ["defect","advisory"].
    const findings = [finding({ id: 'x', kind: 'regression', title: 'Sort by price broken', detail: 'order wrong' })];
    const score = scoreDiscovery(findings, TRUTH, seeded);
    expect(score.detected).toEqual([]);
    expect(score.missed).toEqual(['sort-lexicographic']);
    expect(score.falseDefects).toEqual([]); // not a defect, so not a false Defect either
  });

  it('counts a defect matching no seeded entry as a false Defect', () => {
    const findings = [finding({ id: 'y', kind: 'defect', title: 'Checkout total miscalculated', detail: 'grand total wrong' })];
    const score = scoreDiscovery(findings, TRUTH, seeded);
    expect(score.missed).toEqual(['sort-lexicographic']);
    expect(score.falseDefects.map((f) => f.id)).toEqual(['y']);
  });

  it('treats a defect matching only an unseeded entry as a false Defect', () => {
    // deals-500 exists in TRUTH but is not seeded here, so flagging it is a false positive.
    const findings = [finding({ id: 'z', kind: 'defect', title: 'Deals failed', detail: 'deals returned a 500 error' })];
    const score = scoreDiscovery(findings, TRUTH, seeded);
    expect(score.falseDefects.map((f) => f.id)).toEqual(['z']);
  });

  it('ignores unseeded truth entries in detected/missed', () => {
    const score = scoreDiscovery([], TRUTH, seeded);
    expect(score.missed).toEqual(['sort-lexicographic']); // deals-500 not seeded → not reported missed
  });
});

describe('scoreDispositions', () => {
  const findings: Finding[] = [
    finding({ id: 'regression-add-to-cart', kind: 'regression', title: 't', diagnosis: { rootCause: 'r', faultDomain: 'app', confidence: 80, disposition: { verdict: 'intended-change', citations: [], rationale: 'x', confidence: 80 } } }),
    finding({ id: 'regression-foo', kind: 'regression', title: 't', diagnosis: { rootCause: 'r', faultDomain: 'app', confidence: 80, disposition: { verdict: 'bug', citations: [], rationale: 'x', confidence: 80 } } }),
    finding({ id: 'regression-bar', kind: 'regression', title: 't' }), // no diagnosis at all
  ];

  it('splits into correct, wrong, and missing by Finding id', () => {
    const score = scoreDispositions(findings, {
      'regression-add-to-cart': 'intended-change',
      'regression-foo': 'intended-change',
      'regression-bar': 'intended-change',
      'regression-absent': 'intended-change',
    });
    expect(score.correct).toEqual(['regression-add-to-cart']);
    expect(score.wrong).toEqual([{ id: 'regression-foo', got: 'bug', want: 'intended-change' }]);
    expect(score.missing.sort()).toEqual(['regression-absent', 'regression-bar']);
  });
});
