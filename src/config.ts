import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Effort } from './run/effort.js';

/** Persisted by `autoend init`; flags on `autoend <url>` override it. */
export interface AutoendConfig {
  target: string;
  effort: Effort;
  /** Cursor model id for all agent roles; absent = strongest available (ADR-0009). */
  model?: string;
}

export function configPath(repoRoot: string): string {
  return join(repoRoot, '.autoend', 'config.json');
}

export async function loadConfig(repoRoot: string): Promise<AutoendConfig | undefined> {
  try {
    return JSON.parse(await readFile(configPath(repoRoot), 'utf8')) as AutoendConfig;
  } catch {
    return undefined;
  }
}

export async function saveConfig(repoRoot: string, config: AutoendConfig): Promise<void> {
  await mkdir(join(repoRoot, '.autoend'), { recursive: true });
  await writeFile(configPath(repoRoot), JSON.stringify(config, null, 2));
}

/** Minimal .env loader — sets vars that aren't already in the environment. */
export async function loadDotEnv(repoRoot: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(join(repoRoot, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

export async function appendDotEnv(repoRoot: string, key: string, value: string): Promise<void> {
  const path = join(repoRoot, '.env');
  let raw = '';
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    // no .env yet
  }
  const line = `${key}=${value}`;
  const next = raw.length === 0 ? `${line}\n` : raw.endsWith('\n') ? `${raw}${line}\n` : `${raw}\n${line}\n`;
  await writeFile(path, next);
}

/** Ensure the host repo's .gitignore contains each line (creates the file if missing). */
export async function ensureGitignore(repoRoot: string, lines: string[]): Promise<string[]> {
  const path = join(repoRoot, '.gitignore');
  let raw = '';
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    // no .gitignore yet
  }
  const existing = new Set(raw.split('\n').map((l) => l.trim()));
  const missing = lines.filter((l) => !existing.has(l));
  if (missing.length > 0) {
    const base = raw.length === 0 || raw.endsWith('\n') ? raw : `${raw}\n`;
    await writeFile(path, `${base}${missing.join('\n')}\n`);
  }
  return missing;
}
