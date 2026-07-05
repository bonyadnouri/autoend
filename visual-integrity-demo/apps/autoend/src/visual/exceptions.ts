import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface VisualException {
  ruleId: string;
  targetHost: string;
}

interface VisualExceptionsFile {
  exceptions: VisualException[];
}

function exceptionsPath(repoRoot: string): string {
  return join(repoRoot, '.autoend', 'visual-exceptions.json');
}

/** Accepted visual deviations — future Runs skip matching rule/host pairs. */
export async function readVisualExceptions(repoRoot: string): Promise<VisualException[]> {
  try {
    const raw = await readFile(exceptionsPath(repoRoot), 'utf8');
    const parsed = JSON.parse(raw) as VisualExceptionsFile;
    if (!Array.isArray(parsed.exceptions)) return [];
    return parsed.exceptions.filter(
      (e): e is VisualException =>
        typeof e?.ruleId === 'string' && e.ruleId.length > 0 && typeof e?.targetHost === 'string' && e.targetHost.length > 0,
    );
  } catch {
    return [];
  }
}

export async function addVisualException(
  repoRoot: string,
  ruleId: string,
  targetHost: string,
): Promise<void> {
  const exceptions = await readVisualExceptions(repoRoot);
  if (exceptions.some((e) => e.ruleId === ruleId && e.targetHost === targetHost)) return;
  exceptions.push({ ruleId, targetHost });
  await mkdir(join(repoRoot, '.autoend'), { recursive: true });
  await writeFile(exceptionsPath(repoRoot), JSON.stringify({ exceptions }, null, 2));
}

export function isVisualExcepted(
  exceptions: VisualException[],
  ruleId: string,
  targetHost: string,
): boolean {
  return exceptions.some((e) => e.ruleId === ruleId && e.targetHost === targetHost);
}
