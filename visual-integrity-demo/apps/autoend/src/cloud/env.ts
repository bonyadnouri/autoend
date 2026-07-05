import {
  assertSafeCloudEnvVars,
  loadSidearmConfig,
  newRunId as sidearmNewRunId,
  type SidearmConfig,
} from '@hack-raise/cursor-cloud-sidearm';
import { EFFORT_LEVELS, isEffort } from '../run/effort.js';

/** autoend's env contract is the shared sidearm's SidearmConfig — no domain fields added. */
export type AutoendCloudConfig = SidearmConfig;

export const AUTOEND_FLOW_SYNC_MODES = ['delta', 'none'] as const;
export type AutoendFlowSyncMode = (typeof AUTOEND_FLOW_SYNC_MODES)[number];

export function isAutoendFlowSyncMode(value: string): value is AutoendFlowSyncMode {
  return (AUTOEND_FLOW_SYNC_MODES as readonly string[]).includes(value);
}

/**
 * autoend's env loader on top of the shared sidearm: AUTOEND_PROFILE (when
 * set) forces the profile, mirroring hack-raise's HACK_RAISE_PROFILE override.
 */
export function loadAutoendCloudConfig(): AutoendCloudConfig {
  return loadSidearmConfig({ profileOverrideEnv: 'AUTOEND_PROFILE' });
}

/** Respects AUTOEND_RUN_ID (e.g. set by an orchestrator) before minting a fresh run id. */
export function newAutoendRunId(explicit?: string): string {
  return sidearmNewRunId(explicit ?? process.env.AUTOEND_RUN_ID);
}

export interface BuildAutoendEnvVarsInput {
  runId: string;
  target: string;
  effort: string;
  artifactDir?: string;
  flowSyncMode?: string;
}

/**
 * autoend's per-run env var contract — domain-specific, stays out of the
 * shared sidearm. Deliberately never accepts or emits AUTOEND_CURSOR_API_KEY
 * or any CURSOR_*-prefixed name: assertSafeCloudEnvVars is the last line of
 * defense, but the input shape here structurally can't carry a secret since
 * every key is a fixed, non-secret literal.
 */
export function buildAutoendEnvVars(input: BuildAutoendEnvVarsInput): Record<string, string> {
  if (!input.runId) {
    throw new Error('AUTOEND_RUN_ID is required');
  }
  if (!input.target) {
    throw new Error('AUTOEND_TARGET is required');
  }
  if (!isEffort(input.effort)) {
    throw new Error(`Unknown autoend effort "${input.effort}" (expected ${EFFORT_LEVELS.join(', ')})`);
  }
  if (input.flowSyncMode !== undefined && !isAutoendFlowSyncMode(input.flowSyncMode)) {
    throw new Error(
      `Unknown AUTOEND_FLOW_SYNC_MODE "${input.flowSyncMode}" (expected ${AUTOEND_FLOW_SYNC_MODES.join(' or ')})`
    );
  }

  const vars: Record<string, string> = {
    AUTOEND_RUN_ID: input.runId,
    AUTOEND_TARGET: input.target,
    AUTOEND_EFFORT: input.effort,
    // The thin runner hardcodes --no-serve itself rather than trusting the
    // cloud agent to remember the flag; this var documents the contract and
    // gives the shell script a value to assert on.
    AUTOEND_NO_SERVE: '1',
  };
  if (input.artifactDir) {
    vars.AUTOEND_ARTIFACT_DIR = input.artifactDir;
  }
  if (input.flowSyncMode) {
    vars.AUTOEND_FLOW_SYNC_MODE = input.flowSyncMode;
  }

  assertSafeCloudEnvVars(vars);
  return vars;
}
