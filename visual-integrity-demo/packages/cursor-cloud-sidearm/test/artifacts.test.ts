import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadCloudArtifacts, sanitizeArtifactPath } from "../src/artifacts.js";
import type { CloudArtifactRef } from "../src/types.js";

describe("sanitizeArtifactPath", () => {
  it("strips leading slashes", () => {
    expect(sanitizeArtifactPath("/reports/report.json")).toBe("reports/report.json");
  });

  it("strips .. segments (may leave doubled slashes; path.join normalizes those on write, see below)", () => {
    expect(sanitizeArtifactPath("../../etc/passwd")).toBe("//etc/passwd");
    expect(sanitizeArtifactPath("nested/../../secrets.txt")).toBe("nested///secrets.txt");
  });

  it("leaves an already-safe relative path unchanged", () => {
    expect(sanitizeArtifactPath("evidence/flow-1.webm")).toBe("evidence/flow-1.webm");
  });
});

describe("downloadCloudArtifacts", () => {
  let destDir: string;

  beforeEach(async () => {
    destDir = await mkdtemp(path.join(tmpdir(), "sidearm-artifacts-"));
  });

  afterEach(async () => {
    await rm(destDir, { recursive: true, force: true });
  });

  it("downloads every listed artifact into destDir, preserving relative structure", async () => {
    const artifacts: CloudArtifactRef[] = [
      { path: "run-manifest.json", sizeBytes: 2, updatedAt: "2026-07-04T00:00:00.000Z" },
      { path: "evidence/flow.webm", sizeBytes: 3, updatedAt: "2026-07-04T00:00:00.000Z" },
    ];
    const downloaded: string[] = [];
    const agent = {
      listArtifacts: async () => artifacts,
      downloadArtifact: async (artifactPath: string) => {
        downloaded.push(artifactPath);
        return Buffer.from(`contents of ${artifactPath}`);
      },
    };

    const result = await downloadCloudArtifacts(agent, destDir);

    expect(result.dir).toBe(destDir);
    expect(result.savedPaths).toHaveLength(2);
    expect(downloaded).toEqual(["run-manifest.json", "evidence/flow.webm"]);

    const manifest = await readFile(path.join(destDir, "run-manifest.json"), "utf8");
    expect(manifest).toBe("contents of run-manifest.json");
    const video = await readFile(path.join(destDir, "evidence", "flow.webm"), "utf8");
    expect(video).toBe("contents of evidence/flow.webm");
  });

  it("keeps a traversal-attempting artifact path inside destDir on write", async () => {
    const agent = {
      listArtifacts: async () => [
        { path: "../../escape.txt", sizeBytes: 1, updatedAt: "2026-07-04T00:00:00.000Z" },
      ],
      downloadArtifact: async () => Buffer.from("payload"),
    };

    const result = await downloadCloudArtifacts(agent, destDir);

    // sanitizeArtifactPath leaves doubled slashes ("//escape.txt"); path.join
    // below normalizes those away, so the final path still resolves inside destDir.
    expect(result.savedPaths).toEqual([path.join(destDir, "escape.txt")]);
    expect(result.savedPaths[0].startsWith(destDir)).toBe(true);
    const contents = await readFile(path.join(destDir, "escape.txt"), "utf8");
    expect(contents).toBe("payload");
  });

  it("returns an empty result when there are no artifacts", async () => {
    const agent = {
      listArtifacts: async () => [],
      downloadArtifact: async () => Buffer.from(""),
    };

    const result = await downloadCloudArtifacts(agent, destDir);
    expect(result.savedPaths).toEqual([]);
  });
});
