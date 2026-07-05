/**
 * Fleet auth (decided in the grilling session): login ONCE with the Test
 * Account, capture the session as storage state, inject it into every
 * agent's browser context. One login per Run — no parallel-login lockouts.
 *
 * v1 supports form-based login only; OAuth/SSO/MFA Targets fail early with a
 * clear message (CONTEXT.md: Test Account). v1.1 adds a second *producer*
 * (user-captured session) — the consuming side stays unchanged.
 */
export interface TestAccount {
  username: string;
  password: string;
}

export function testAccountFromEnv(): TestAccount | undefined {
  const username = process.env.AUTOEND_USER;
  const password = process.env.AUTOEND_PASS;
  if (!username || !password) return undefined;
  return { username, password };
}

/** Perform the single form login and return the path to the captured storage state. */
export async function produceStorageState(_target: URL, _account: TestAccount): Promise<string> {
  // TODO: drive the Target's login form once (Playwright), save storageState to
  // a Run-scoped temp file, return its path for every explorer/replay context.
  throw new Error('fleet auth is not implemented yet (scaffold)');
}
