import { checkSidearmEnvironment } from "@hack-raise/cursor-cloud-sidearm";
import { assertSafeCloudEnvVars, buildPerRunEnvVars, loadOrchestratorEnv } from "./env.js";

async function main() {
  console.log("Hack Raise Cloud Agent environment check\n");

  const nodeVersion = process.versions.node;
  const [major, minor, patch] = nodeVersion.split(".").map(Number);
  const nodeOk =
    major > 23 || (major === 23 && (minor > 6 || (minor === 6 && patch >= 0)));
  console.log(`Node ${nodeVersion}: ${nodeOk ? "OK" : "FAIL (need >=23.6.0)"}`);

  const env = loadOrchestratorEnv();
  console.log(`Profile: ${env.profile}`);
  console.log(`Model preference: ${env.modelId}`);
  console.log(`API key present: ${env.apiKey ? "yes" : "no"}`);

  const report = await checkSidearmEnvironment(env);

  if (env.profile === "cloud-env") {
    console.log(`Cloud environment: ${env.cloudEnvName ?? "(missing)"}`);
    console.log(
      report.cloudOptionsOk
        ? "cloud-env options: OK"
        : `cloud-env options: FAIL — ${report.cloudOptionsError}`
    );
  }

  if (env.profile === "cloud-repo") {
    console.log(`Repo URL: ${env.repoUrl ?? "(missing)"}`);
    console.log(`Starting ref: ${env.startingRef}`);
    console.log(
      report.cloudOptionsOk
        ? "cloud-repo options: OK"
        : `cloud-repo options: FAIL — ${report.cloudOptionsError}`
    );
    console.log(
      "\nTip: cloud-repo cold runs take ~10-15 min. For ~2-5 min warm runs, set CURSOR_CLOUD_ENV_NAME (see docs/cloud-env-setup.md)."
    );
  }

  const sampleEnv = buildPerRunEnvVars({
    runId: "check-run",
    scenarioId: "user-dashboard-next",
    role: "user",
  });
  try {
    assertSafeCloudEnvVars(sampleEnv);
    console.log("\nPer-run env vars to inject:");
    for (const [k, v] of Object.entries(sampleEnv)) {
      console.log(`  ${k}=${v}`);
    }
  } catch (err) {
    console.log(`Env var validation: FAIL — ${err instanceof Error ? err.message : err}`);
  }

  if (env.apiKey) {
    if (report.apiAuthOk) {
      console.log(`\nAPI auth: OK (${report.modelCount} models available)`);
      console.log(
        `Preferred model ${env.modelId}: ${report.preferredModelAvailable ? "available" : "not found (will fallback)"}`
      );
    } else {
      console.log(`\nAPI auth: FAIL — ${report.apiAuthError}`);
      process.exitCode = 1;
    }
  } else {
    console.log("\nAPI auth: skipped (CURSOR_API_KEY not set)");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
