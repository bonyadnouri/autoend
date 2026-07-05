import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * The exploring agents' hands (ADR-0002): the agent-browser CLI.
 * Agents drive it via snapshot-with-refs then act-by-ref; Evidence for
 * exploration comes from `record start <path.webm>` / `record stop`.
 *
 * agent-browser is a direct dependency, so its binary ships with autoend.
 * We resolve the platform binary explicitly rather than relying on PATH — the
 * package's own JS wrapper has no Windows-ARM64 fallback (it looks for a
 * win32-arm64 build that is never published), so `autoend` would otherwise fail
 * on ARM64 Windows even though the x64 binary runs fine under emulation.
 */
function resolveBinary(): string {
  try {
    const require = createRequire(import.meta.url);
    const binDir = join(dirname(require.resolve('agent-browser/package.json')), 'bin');
    const os = platform();
    // Windows ARM64 has no native build; the x64 binary runs via emulation
    // (mirrors agent-browser's own postinstall fallback).
    const cpuArch = os === 'win32' && arch() === 'arm64' ? 'x64' : arch();
    const ext = os === 'win32' ? '.exe' : '';
    const osKey = os === 'linux' ? 'linux' : os;
    const candidate = join(binDir, `agent-browser-${osKey}-${cpuArch}${ext}`);
    if (existsSync(candidate)) return candidate;
  } catch {
    // fall back to PATH lookup below
  }
  return 'agent-browser';
}

const BINARY = resolveBinary();

export async function agentBrowser(args: string[]): Promise<string> {
  const { stdout } = await exec(BINARY, args);
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
