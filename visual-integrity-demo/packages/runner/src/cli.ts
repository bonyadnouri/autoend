#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import type { RunManifest } from "@hack-raise/graph-core";
import {
  getScenariosToRun,
  printHelp,
  resolveRunnerConfig,
  writeManifest,
} from "./config.js";
import { launchBrowser, runScenario } from "./scenarios.js";
import { startTestpad, stopTestpad, waitForReady } from "./server.js";

async function main() {
  const config = resolveRunnerConfig(process.argv.slice(2));
  if ((process.argv.includes("--help"))) {
    printHelp();
    return;
  }

  await mkdir(config.artifactDir, { recursive: true });

  let child: ChildProcess | null = null;
  const baseUrl =
    config.baseUrl ?? `http://127.0.0.1:${config.port}`;

  if (config.startApp) {
    console.log(`Starting testpad on ${baseUrl}...`);
    child = startTestpad(config.port);
    child.stdout?.on("data", (d) => process.stdout.write(d));
    child.stderr?.on("data", (d) => process.stderr.write(d));
    await waitForReady(baseUrl);
  }

  const scenarios = getScenariosToRun(config.scenarioId);
  const browser = await launchBrowser();
  const scenarioRuns = [];

  try {
    for (const scenario of scenarios) {
      console.log(`Running scenario ${scenario.scenarioId}...`);
      const run = await runScenario(browser, config, baseUrl, scenario);
      scenarioRuns.push(run);
      console.log(
        `  ${run.status} — findings: ${run.findings.map((f) => f.bugId).join(", ") || "none"}`
      );
    }
  } finally {
    await browser.close();
    await stopTestpad(child);
  }

  const manifest: RunManifest = {
    runId: config.runId,
    target: {
      name: "testpad",
      baseUrl,
    },
    scenarioRuns,
    createdAt: new Date().toISOString(),
    status: scenarioRuns.some((r) => r.status === "failed")
      ? "failed"
      : "passed",
  };

  const manifestPath = await writeManifest(config.artifactDir, manifest);
  console.log(`Run manifest: ${manifestPath}`);
  console.log(`Artifacts: ${config.artifactDir}/${config.runId}`);

  if (manifest.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
