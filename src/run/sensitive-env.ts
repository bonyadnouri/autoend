/**
 * Guardrail for the verify-by-running trust boundary (ADR-0002, issue #3).
 *
 * Discovered and replayed Flow scripts are LLM-authored and run in-process via
 * dynamic import(), so they inherit the Run's full Node authority — including
 * whatever secrets `.env` loaded into `process.env` (notably CURSOR_API_KEY).
 * A flow script never needs those secrets: it only drives a Playwright `page`.
 *
 * `withoutSensitiveEnv` removes secret-looking variables from `process.env`
 * for the duration of a callback and restores them afterward, so a malicious or
 * buggy generated script can't read them. It is a defense-in-depth mitigation,
 * not a sandbox — full isolation (running scripts in a locked-down child
 * process) is tracked separately.
 *
 * IMPORTANT: `process.env` is process-global, so wrap a whole batch of script
 * executions in one call rather than each script — never run agent creation
 * (which needs the key) concurrently inside the callback.
 */

/** A variable is treated as a secret when its name matches this pattern. */
const SENSITIVE_ENV_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|PRIVATE)/i;

export function isSensitiveEnvName(name: string): boolean {
  return SENSITIVE_ENV_PATTERN.test(name);
}

/**
 * Run `fn` with secret-looking `process.env` entries temporarily removed,
 * restoring the exact prior environment in a `finally` (even on throw).
 */
export async function withoutSensitiveEnv<T>(fn: () => Promise<T>): Promise<T> {
  const removed: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && isSensitiveEnvName(name)) {
      removed[name] = value;
      delete process.env[name];
    }
  }
  try {
    return await fn();
  } finally {
    for (const [name, value] of Object.entries(removed)) {
      process.env[name] = value;
    }
  }
}
