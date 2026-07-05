#!/usr/bin/env node
/**
 * CI helper: run one E2E scenario and assert the expected seeded bug appears
 * in run-manifest.json. Exits 0 on success (bug reproduced as expected).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCENARIO_EXPECTED_BUG = {
  "user-dashboard-next": "BUG_NEXT_INERT",
  "user-admin-authz": "BUG_ADMIN_AUTHZ",
  "user-task-create": "BUG_TASK_CREATE_500",
  "user-broken-link": "BUG_BROKEN_PROJECT_LINK",
};

const scenarioId = process.argv[2] ?? "user-dashboard-next";
const expectedBug = SCENARIO_EXPECTED_BUG[scenarioId];

if (!expectedBug) {
  console.error(`Unknown scenario: ${scenarioId}`);
  console.error(`Known: ${Object.keys(SCENARIO_EXPECTED_BUG).join(", ")}`);
  process.exit(1);
}

const runId = randomUUID();
const artifactDir = ".hack-raise/runs";

console.log(`verify-e2e: scenario=${scenarioId} expectedBug=${expectedBug} runId=${runId}`);

const result = spawnSync(
  "pnpm",
  ["test:e2e", "--", "--scenario", scenarioId, "--run-id", runId],
  { cwd: repoRoot, stdio: "inherit", env: process.env }
);

if (result.status !== 1) {
  console.error(
    `Expected Playwright exit code 1 (seeded bug reproduced), got ${result.status ?? "signal"}`
  );
  process.exit(1);
}

const manifestPath = path.join(repoRoot, artifactDir, runId, "run-manifest.json");
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (err) {
  console.error(`Failed to read manifest at ${manifestPath}:`, err.message);
  process.exit(1);
}

const bugIds = (manifest.scenarioRuns ?? []).flatMap((run) =>
  (run.findings ?? []).map((f) => f.bugId)
);

if (!bugIds.includes(expectedBug)) {
  console.error(
    `Manifest missing expected bug ${expectedBug}. Found: ${bugIds.join(", ") || "none"}`
  );
  process.exit(1);
}

console.log(`OK: ${scenarioId} reproduced ${expectedBug} (manifest validated)`);
