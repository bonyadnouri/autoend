import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CloudArtifactRef } from "./types.js";

/** Minimal shape the SDK's Agent handle satisfies — kept narrow so tests can mock it trivially. */
export interface ArtifactAgent {
  listArtifacts(): Promise<CloudArtifactRef[]>;
  downloadArtifact(artifactPath: string): Promise<Buffer>;
}

/** Strips leading slashes and ".." segments so a malicious artifact path can't escape destDir. */
export function sanitizeArtifactPath(artifactPath: string): string {
  return artifactPath.replace(/^\/+/, "").replace(/\.\./g, "");
}

/**
 * Downloads every artifact the SDK reports for this agent into destDir,
 * preserving each artifact's relative path. Callers own destDir naming
 * (e.g. `<runRoot>/<runId>/<agentId>`) — this function has no opinion about
 * where runs or agents live on disk.
 */
export async function downloadCloudArtifacts(
  agent: ArtifactAgent,
  destDir: string
): Promise<{ dir: string; savedPaths: string[] }> {
  const artifacts = await agent.listArtifacts();
  await mkdir(destDir, { recursive: true });

  const savedPaths: string[] = [];
  for (const artifact of artifacts) {
    const buffer = await agent.downloadArtifact(artifact.path);
    const relativePath = sanitizeArtifactPath(artifact.path);
    const outPath = path.join(destDir, relativePath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);
    savedPaths.push(outPath);
  }

  return { dir: destDir, savedPaths };
}
