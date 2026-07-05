import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SCENARIOS } from "@hack-raise/graph-core/fixtures";
import {
  createCloudAgent,
  downloadCloudArtifacts,
  logPhase,
  resolveCloudProfile,
  resolveModelId,
  streamCloudRun,
} from "@hack-raise/cursor-cloud-sidearm";
import {
  buildPerRunEnvVars,
  loadOrchestratorEnv,
  newRunId,
  redactForSummary,
} from "./env.js";
import {
  cloudArtifactsDirFor,
  deriveRunOutcome,
  persistAgentRun,
  recordStatusFromOutcome,
} from "./persist.js";
import { buildPlaywrightPrompt, buildSmokePrompt } from "./prompts.js";

function parseArgs(argv: string[]) {
  const scenarios: string[] = [];
  let smoke = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario") scenarios.push(argv[++i]);
    else if (arg === "--smoke") smoke = true;
    else if (arg === "--help") return { help: true as const, scenarios, smoke };
  }
  return { help: false as const, scenarios, smoke };
}

function printHelp() {
  console.log(`Usage: pnpm agents:playwright -- [options]

Options:
  --scenario <id>   Launch one Cloud Agent per scenario (repeatable)
  --smoke           Run cloud smoke check instead of Playwright
  --help            Show help

Scenarios:
${SCENARIOS.map((s) => `  - ${s.scenarioId}`).join("\n")}
`);
}

async function launchScenario(
  env: ReturnType<typeof loadOrchestratorEnv>,
  scenarioId: string,
  runId: string,
  modelId: string,
  smoke: boolean
) {
  const scenario = SCENARIOS.find((s) => s.scenarioId === scenarioId);
  if (!scenario && !smoke) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  const profile = resolveCloudProfile(env);
  const perRunEnv = buildPerRunEnvVars({
    runId,
    scenarioId: smoke ? "cloud-smoke" : scenarioId,
    role: scenario?.role ?? "user",
  });

  console.log(`Creating cloud agent (${profile}) for ${smoke ? "smoke" : scenarioId}...`);
  logPhase("Tip: watch live in Cursor → Agents → Filter → Source → SDK");

  const prompt = smoke ? buildSmokePrompt() : buildPlaywrightPrompt(scenarioId, profile);
  const { agent, profile: resolvedProfile } = await createCloudAgent(
    {
      name: smoke ? `hack-raise-smoke-${runId.slice(0, 8)}` : `hack-raise-${scenarioId}`,
      prompt,
      envVars: perRunEnv,
      modelId,
    },
    env
  );
  logPhase(`Agent created: ${agent.agentId}`);

  try {
    const { result, transcript } = await streamCloudRun(agent, prompt, perRunEnv);

    const artifacts = await agent.listArtifacts();
    console.log(`\nArtifacts (${artifacts.length}):`);
    for (const artifact of artifacts) {
      console.log(`  - ${artifact.path} (${artifact.sizeBytes} bytes)`);
    }

    const { dir: cloudArtifactsDir, savedPaths } = await downloadCloudArtifacts(
      agent,
      cloudArtifactsDirFor(runId, agent.agentId)
    );
    if (savedPaths.length > 0) {
      console.log(`Downloaded ${savedPaths.length} cloud artifact(s) to ${cloudArtifactsDir}`);
    }

    const summaryPath = path.join(".hack-raise/agent-runs", runId, `${agent.agentId}-transcript.txt`);
    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, redactForSummary(transcript));

    const outcome = deriveRunOutcome(
      result.status === "finished",
      result.status,
      transcript,
      result.result
    );
    console.log(`Agent: ${outcome.agentStatus}. Scenario: ${outcome.scenarioStatus ?? "unknown"}.`);
    console.log(outcome.summary);

    const recordPath = await persistAgentRun({
      agentId: agent.agentId,
      runId,
      requestId: result.requestId,
      profile: resolvedProfile,
      status: recordStatusFromOutcome(outcome),
      result: redactForSummary(`${outcome.summary}\n\n${result.result ?? ""}`),
      artifacts: artifacts.map((a) => ({
        artifactId: a.path,
        kind: "other" as const,
        path: a.path,
        createdAt: a.updatedAt,
        redactionStatus: "partial" as const,
      })),
      repoRef: env.startingRef,
      environmentName: env.cloudEnvName,
      durationMs: result.durationMs,
    });

    console.log(`Agent run record: ${recordPath}`);
    return { agent, result, artifacts };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const env = loadOrchestratorEnv();
  if (!env.apiKey) {
    throw new Error("CURSOR_API_KEY is required (local orchestrator only — never pass to cloud envVars)");
  }
  if (env.profile === "local-dev") {
    throw new Error("Cloud orchestrator requires cloud-repo or cloud-env profile. Set CURSOR_REPO_URL or CURSOR_CLOUD_ENV_NAME.");
  }

  const modelId = await resolveModelId(env);
  console.log(`Using model: ${modelId}`);

  const runId = newRunId();
  const scenarioIds =
    args.scenarios.length > 0
      ? args.scenarios
      : args.smoke
        ? ["cloud-smoke"]
        : SCENARIOS.map((s) => s.scenarioId);

  for (const scenarioId of scenarioIds) {
    if (args.smoke || scenarioId === "cloud-smoke") {
      await launchScenario(env, "cloud-smoke", runId, modelId, true);
    } else {
      await launchScenario(env, scenarioId, runId, modelId, false);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
