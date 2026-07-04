import { describe, expect, it } from 'vitest';
import { formatRunHistory, isFlaky } from '../src/map/flaky.js';

describe('isFlaky', () => {
  it('returns false with no history', () => {
    expect(isFlaky(undefined)).toBe(false);
    expect(isFlaky([])).toBe(false);
  });

  it('returns false when every prior run passed', () => {
    expect(isFlaky([{ runId: 'a', passed: true }, { runId: 'b', passed: true }])).toBe(false);
  });

  it('returns false when every prior run failed', () => {
    expect(isFlaky([{ runId: 'a', passed: false }])).toBe(false);
  });

  it('returns true when history mixes pass and fail', () => {
    expect(isFlaky([{ runId: 'a', passed: true }, { runId: 'b', passed: false }])).toBe(true);
    expect(isFlaky([{ runId: 'a', passed: false }, { runId: 'b', passed: true }])).toBe(true);
  });
});

describe('formatRunHistory', () => {
  it('summarizes outcomes as pass/fail arrows', () => {
    expect(formatRunHistory([{ runId: 'a', passed: true }, { runId: 'b', passed: false }])).toBe(
      'pass → fail',
    );
  });

  it('handles empty history', () => {
    expect(formatRunHistory(undefined)).toBe('no prior replay history');
  });
});
