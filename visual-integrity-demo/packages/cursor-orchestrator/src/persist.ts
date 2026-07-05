import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRunRecordSchema, type AgentRunRecord, type RunStatus } from "@hack-raise/graph-core";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const OUTPUT_DIR = path.join(repoRoot, ".hack-raise/agent-runs");
const CLOUD_ARTIFACTS_DIR = path.join(repoRoot, ".hack-raise/cloud-artifacts");

export async function persistAgentRun(record: AgentRunRecord): Promise<string> {
  const validated = AgentRunRecordSchema.parse(record);
  const dir = path.join(OUTPUT_DIR, validated.runId);
  await mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${validated.agentId}.json`);
  await writeFile(outPath, JSON.stringify(validated, null, 2));
  return outPath;
}

export function getOutputDir(): string {
  return OUTPUT_DIR;
}

/**
 * Where this run+agent's cloud artifacts should be downloaded to — passed to
 * the shared sidearm's `downloadCloudArtifacts(agent, destDir)`. Kept here
 * (not in the sidearm) because the `.hack-raise/cloud-artifacts/<runId>/<agentId>`
 * layout is a hack-raise convention, not a generic one.
 */
export function cloudArtifactsDirFor(runId: string, agentId: string): string {
  return path.join(CLOUD_ARTIFACTS_DIR, runId, agentId);
}

export type RunOutcome = {
  agentStatus: RunStatus;
  scenarioStatus: RunStatus | null;
  summary: string;
};

/**
 * hack-raise's outcome semantics are intentionally inverted from normal CI:
 * Playwright exit 1 / a BUG_* id in the transcript means the seeded bug was
 * reproduced, i.e. the *agent* succeeded even though the *scenario* "failed".
 * This parsing is testbed-specific and does not belong in the shared sidearm.
 */
export function deriveRunOutcome(
  agentFinished: boolean,
  agentStatusRaw: string,
  transcript: string,
  resultText?: string
): RunOutcome {
  const combined = `${transcript}\n${resultText ?? ""}`;
  const exitMatch = combined.match(/exit code[:\s]+(\d+)/i);
  const exitCode = exitMatch ? Number.parseInt(exitMatch[1], 10) : null;
  const bugIds = [...combined.matchAll(/\bBUG_[A-Z0-9_]+\b/g)].map((m) => m[0]);
  const uniqueBugs = [...new Set(bugIds)];

  if (!agentFinished) {
    const agentStatus: RunStatus =
      agentStatusRaw === "cancelled" ? "cancelled" : agentStatusRaw === "error" ? "error" : "failed";
    return {
      agentStatus,
      scenarioStatus: null,
      summary: `Agent did not finish (${agentStatusRaw}).`,
    };
  }

  const scenarioFailed = exitCode === 1 || uniqueBugs.length > 0;
  const scenarioStatus: RunStatus = scenarioFailed ? "failed" : "passed";
  const bugSummary =
    uniqueBugs.length > 0
      ? ` Bugs found: ${uniqueBugs.join(", ")}.`
      : exitCode === 1
        ? " Playwright exit 1 (seeded bugs expected)."
        : "";

  return {
    agentStatus: "passed",
    scenarioStatus,
    summary: `Agent finished.${exitCode !== null ? ` Playwright exit ${exitCode}.` : ""}${bugSummary}`,
  };
}

export function recordStatusFromOutcome(outcome: RunOutcome): RunStatus {
  if (outcome.agentStatus !== "passed") return outcome.agentStatus;
  return outcome.scenarioStatus ?? "passed";
}
