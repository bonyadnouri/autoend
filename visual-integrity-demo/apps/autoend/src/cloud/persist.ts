import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redactForSummary } from '@hack-raise/cursor-cloud-sidearm';

/** Local-only records of a cloud run's transcript, separate from the VM-side .autoend/runs/<runId>/. */
export function cloudRunsDir(repoRoot: string, runId: string): string {
  return join(repoRoot, '.autoend', 'cloud-runs', runId);
}

/** Where downloadCloudArtifacts() saves this run's downloaded VM artifacts. */
export function cloudArtifactsDirFor(repoRoot: string, runId: string): string {
  return join(repoRoot, '.autoend', 'cloud-artifacts', runId);
}

/** Persists a redacted transcript locally and returns its path. */
export async function persistCloudTranscript(
  repoRoot: string,
  runId: string,
  agentId: string,
  transcript: string
): Promise<string> {
  const dir = cloudRunsDir(repoRoot, runId);
  await mkdir(dir, { recursive: true });
  const transcriptPath = join(dir, `${agentId}-transcript.txt`);
  await writeFile(transcriptPath, redactForSummary(transcript));
  return transcriptPath;
}
