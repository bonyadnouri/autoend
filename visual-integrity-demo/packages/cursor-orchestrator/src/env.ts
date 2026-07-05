import {
  assertSafeCloudEnvVars,
  loadSidearmConfig,
  newRunId as sidearmNewRunId,
  redactForSummary,
  type SidearmConfig,
} from "@hack-raise/cursor-cloud-sidearm";

/** hack-raise's env contract is the shared sidearm's SidearmConfig — no domain fields added. */
export type OrchestratorEnv = SidearmConfig;

/**
 * hack-raise's env loader on top of the shared sidearm: HACK_RAISE_PROFILE
 * (when set) forces the profile, same override the orchestrator relied on
 * before the sidearm extraction.
 */
export function loadOrchestratorEnv(): OrchestratorEnv {
  return loadSidearmConfig({ profileOverrideEnv: "HACK_RAISE_PROFILE" });
}

/** hack-raise's per-run env var contract — domain-specific, stays out of the shared sidearm. */
export function buildPerRunEnvVars(input: {
  runId: string;
  scenarioId: string;
  role: string;
  artifactDir?: string;
  baseUrl?: string;
}): Record<string, string> {
  const vars: Record<string, string> = {
    HACK_RAISE_RUN_ID: input.runId,
    HACK_RAISE_SCENARIO_ID: input.scenarioId,
    HACK_RAISE_ROLE: input.role,
    HACK_RAISE_ARTIFACT_DIR: input.artifactDir ?? ".hack-raise/runs",
  };
  if (input.baseUrl) {
    vars.HACK_RAISE_TESTPAD_BASE_URL = input.baseUrl;
  }
  return vars;
}

/** Respects HACK_RAISE_RUN_ID (e.g. set by CI) before minting a fresh run id. */
export function newRunId(): string {
  return sidearmNewRunId(process.env.HACK_RAISE_RUN_ID);
}

export { assertSafeCloudEnvVars, redactForSummary };
