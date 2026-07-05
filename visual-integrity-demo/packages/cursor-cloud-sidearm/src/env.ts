import { randomUUID } from "node:crypto";
import type { LoadSidearmConfigOptions, SidearmConfig, SidearmProfile } from "./types.js";

const SECRET_PATTERNS = [/_KEY$/i, /_TOKEN$/i, /_SECRET$/i, /^Authorization$/i, /^Cookie$/i];

/**
 * Reads the standard CURSOR_* env vars and resolves a profile. Apps can pass
 * `profileOverrideEnv` to let a domain-specific env var (e.g. "HACK_RAISE_PROFILE")
 * force a profile, mirroring the override the original hack-raise orchestrator relied on.
 */
export function loadSidearmConfig(options: LoadSidearmConfigOptions = {}): SidearmConfig {
  const cloudEnvName = process.env.CURSOR_CLOUD_ENV_NAME;
  const repoUrl = process.env.CURSOR_REPO_URL;
  const override = options.profileOverrideEnv
    ? (process.env[options.profileOverrideEnv] as SidearmProfile | undefined)
    : undefined;

  return {
    apiKey: process.env.CURSOR_API_KEY,
    repoUrl,
    startingRef: process.env.CURSOR_STARTING_REF ?? "main",
    cloudEnvName,
    modelId: process.env.CURSOR_MODEL_ID ?? options.defaultModelId ?? "composer-2.5",
    profile: resolveProfile(override, cloudEnvName, repoUrl),
  };
}

function resolveProfile(
  override: SidearmProfile | undefined,
  cloudEnvName?: string,
  repoUrl?: string
): SidearmProfile {
  if (override) return override;
  if (cloudEnvName) return "cloud-env";
  if (repoUrl) return "cloud-repo";
  return "local-dev";
}

/**
 * Refuses to forward CURSOR_* keys or anything secret-looking into a cloud
 * agent's envVars. This is the sidearm's core safety invariant: the local
 * orchestrator holds CURSOR_API_KEY, the cloud VM never receives it.
 */
export function assertSafeCloudEnvVars(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith("CURSOR_")) {
      throw new Error(`Refusing to inject cloud env var with CURSOR_ prefix: ${key}`);
    }
    if (SECRET_PATTERNS.some((pattern) => pattern.test(key))) {
      throw new Error(`Refusing to inject secret-like cloud env var: ${key}`);
    }
    if (/token|secret|key=/i.test(value)) {
      throw new Error(`Refusing to inject env var ${key} with secret-like value`);
    }
  }
}

/** Strips common secret query-string params (?token=, &key=, &secret=) before persisting transcripts. */
export function redactForSummary(value: string): string {
  return value.replace(/([?&](token|key|secret)=)[^&]+/gi, "$1[REDACTED]");
}

/** Uses an app-provided run id override (e.g. process.env.HACK_RAISE_RUN_ID) when given, else mints a new one. */
export function newRunId(explicit?: string): string {
  return explicit ?? randomUUID();
}
