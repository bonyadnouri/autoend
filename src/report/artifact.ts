import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunArtifact } from './types.js';

/** Run artifacts live under .autoend/runs/<runId>/ — gitignored, kept until `autoend clean`. */
export function runsDir(repoRoot: string): string {
  return join(repoRoot, '.autoend', 'runs');
}

export interface RunDir {
  dir: string;
  evidenceDir: string;
}

export async function prepareRunDir(repoRoot: string, runId: string): Promise<RunDir> {
  const dir = join(runsDir(repoRoot), runId);
  const evidenceDir = join(dir, 'evidence');
  await mkdir(evidenceDir, { recursive: true });
  return { dir, evidenceDir };
}

export async function writeReport(runDir: string, artifact: RunArtifact): Promise<void> {
  await writeFile(join(runDir, 'report.json'), JSON.stringify(artifact, null, 2));
}

export async function readRunArtifact(runDir: string): Promise<RunArtifact> {
  const raw = await readFile(join(runDir, 'report.json'), 'utf8');
  return JSON.parse(raw) as RunArtifact;
}
