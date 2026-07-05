import { describe, expect, it } from 'vitest';
import { buildAutoendEnvVars, isAutoendFlowSyncMode } from '../src/cloud/env.js';

describe('buildAutoendEnvVars', () => {
  const base = { runId: 'run-1', target: 'https://staging.example.com', effort: 'low' };

  it('builds the required AUTOEND_* vars', () => {
    const vars = buildAutoendEnvVars(base);
    expect(vars).toEqual({
      AUTOEND_RUN_ID: 'run-1',
      AUTOEND_TARGET: 'https://staging.example.com',
      AUTOEND_EFFORT: 'low',
      AUTOEND_NO_SERVE: '1',
    });
  });

  it('includes AUTOEND_ARTIFACT_DIR only when provided', () => {
    const vars = buildAutoendEnvVars({ ...base, artifactDir: '.autoend/cloud-runs' });
    expect(vars.AUTOEND_ARTIFACT_DIR).toBe('.autoend/cloud-runs');
  });

  it('includes AUTOEND_FLOW_SYNC_MODE only when provided', () => {
    expect(buildAutoendEnvVars(base).AUTOEND_FLOW_SYNC_MODE).toBeUndefined();
    expect(buildAutoendEnvVars({ ...base, flowSyncMode: 'none' }).AUTOEND_FLOW_SYNC_MODE).toBe('none');
  });

  it('rejects an unknown effort', () => {
    expect(() => buildAutoendEnvVars({ ...base, effort: 'extreme' })).toThrow(/Unknown autoend effort/);
  });

  it('rejects an unknown flow sync mode', () => {
    expect(() => buildAutoendEnvVars({ ...base, flowSyncMode: 'auto-apply' })).toThrow(
      /Unknown AUTOEND_FLOW_SYNC_MODE/
    );
  });

  it('requires runId and target', () => {
    expect(() => buildAutoendEnvVars({ ...base, runId: '' })).toThrow(/AUTOEND_RUN_ID is required/);
    expect(() => buildAutoendEnvVars({ ...base, target: '' })).toThrow(/AUTOEND_TARGET is required/);
  });

  it('never emits a CURSOR_-prefixed or secret-like var', () => {
    for (const value of Object.values(buildAutoendEnvVars({ ...base, artifactDir: 'x', flowSyncMode: 'delta' }))) {
      expect(value).not.toMatch(/token|secret|key=/i);
    }
  });
});

describe('isAutoendFlowSyncMode', () => {
  it('accepts delta and none', () => {
    expect(isAutoendFlowSyncMode('delta')).toBe(true);
    expect(isAutoendFlowSyncMode('none')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isAutoendFlowSyncMode('auto-apply')).toBe(false);
    expect(isAutoendFlowSyncMode('')).toBe(false);
  });
});
