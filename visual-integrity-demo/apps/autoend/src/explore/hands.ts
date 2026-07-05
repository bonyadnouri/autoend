import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * The exploring agents' hands (ADR-0002): the agent-browser CLI.
 * Agents drive it via snapshot-with-refs then act-by-ref; Evidence for
 * exploration comes from `record start <path.webm>` / `record stop`.
 *
 * agent-browser is a direct dependency, so its binary ships with autoend.
 * TODO: resolve the dependency's bin path explicitly instead of relying on
 * PATH, so `autoend` works outside npm scripts.
 */
export async function agentBrowser(args: string[]): Promise<string> {
  const { stdout } = await exec('agent-browser', args);
  return stdout.trim();
}

export async function handsAvailable(): Promise<boolean> {
  try {
    await agentBrowser(['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Close one explorer's isolated browser session; a no-op if it never opened. */
export async function closeSession(session: string): Promise<void> {
  try {
    await agentBrowser(['--session', session, 'close']);
  } catch {
    // session never opened or already closed — nothing to clean up
  }
}
