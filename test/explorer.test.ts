import { describe, expect, it } from 'vitest';
import { collectProposedFlows, parseExplorerReport, slugify } from '../src/explore/explorer.js';

const SCRIPT = 'export default async function flow(page, target) { await page.goto(target.href); }';

describe('parseExplorerReport', () => {
  it('parses a clean JSON reply', () => {
    const report = parseExplorerReport(
      JSON.stringify({
        flows: [{ id: 'View Pricing!', title: 'Visitor views pricing', script: SCRIPT }],
        findings: [{ kind: 'hard-failure', title: 'Console error on /', detail: 'TypeError: x' }],
      }),
    );
    expect(report?.flows).toEqual([{ id: 'view-pricing', title: 'Visitor views pricing', script: SCRIPT }]);
    expect(report?.findings[0].kind).toBe('hard-failure');
  });

  it('tolerates prose and markdown fences around the JSON', () => {
    const report = parseExplorerReport(
      'Here is my report:\n```json\n{ "flows": [], "findings": [{ "kind": "advisory", "title": "Slow search", "detail": "4s" }] }\n```\nDone!',
    );
    expect(report?.findings).toHaveLength(1);
    expect(report?.flows).toEqual([]);
  });

  it('clamps unknown finding kinds to advisory', () => {
    const report = parseExplorerReport(
      JSON.stringify({ findings: [{ kind: 'catastrophe', title: 'X', detail: '' }] }),
    );
    expect(report?.findings[0].kind).toBe('advisory');
  });

  it('drops flows without a real script', () => {
    const report = parseExplorerReport(
      JSON.stringify({ flows: [{ id: 'a', title: 'A', script: 'console.log(1)' }, { id: 'b', title: 'B' }] }),
    );
    expect(report?.flows).toEqual([]);
  });

  it('returns undefined for garbage', () => {
    expect(parseExplorerReport('no json here')).toBeUndefined();
    expect(parseExplorerReport('{ not: valid json }')).toBeUndefined();
  });
});

describe('collectProposedFlows', () => {
  it('dedupes against the map and across explorers', () => {
    const known = [{ id: 'checkout', title: 'Checkout', discoveredAt: 'x' }];
    const a = { flows: [{ id: 'checkout', title: 'Checkout', script: SCRIPT }, { id: 'search', title: 'Search', script: SCRIPT }], findings: [] };
    const b = { flows: [{ id: 'search', title: 'Search again', script: SCRIPT }, { id: 'signup', title: 'Signup', script: SCRIPT }], findings: [] };
    const proposed = collectProposedFlows([a, b, undefined], known);
    expect(proposed.map((f) => f.id)).toEqual(['search', 'signup']);
  });
});

describe('slugify', () => {
  it('kebab-cases titles', () => {
    expect(slugify('Visitor completes Checkout!')).toBe('visitor-completes-checkout');
  });
  it('rejects empty results', () => {
    expect(slugify('!!!')).toBeUndefined();
  });
});
