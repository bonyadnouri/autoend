import { Agent, Cursor } from "@cursor/sdk";
import { assertSafeCloudEnvVars } from "./env.js";
import { buildCloudOptions, resolveCloudProfile } from "./cloud-profiles.js";
import { downloadCloudArtifacts } from "./artifacts.js";
import { logPhase, logToolCall } from "./progress.js";
import type {
  CloudArtifactRef,
  CloudJobResult,
  CloudJobSpec,
  CloudProfile,
  SidearmConfig,
  SidearmHooks,
} from "./types.js";

type CloudAgentHandle = Awaited<ReturnType<typeof Agent.create>>;

/**
 * Resolves a usable model id: the caller's preference if the Cursor account
 * has access to it, else the first "composer" model, else the account's
 * first available model, else a hardcoded fallback. Never throws — cloud job
 * creation should not fail just because model discovery did.
 */
export async function resolveModelId(config: SidearmConfig): Promise<string> {
  try {
    const models = await Cursor.models.list({ apiKey: config.apiKey });
    const preferred = models.find((m) => m.id === config.modelId);
    if (preferred) return preferred.id;
    const composer = models.find((m) => m.id.includes("composer"));
    if (composer) return composer.id;
    if (models[0]) return models[0].id;
  } catch {
    // fall through to the static default below
  }
  return config.modelId === "auto" ? "composer-2.5" : config.modelId;
}

/** Creates a cloud agent for the given job spec using config's resolved profile. */
export async function createCloudAgent(
  spec: CloudJobSpec,
  config: SidearmConfig
): Promise<{ agent: CloudAgentHandle; profile: CloudProfile }> {
  if (!config.apiKey) {
    throw new Error("SidearmConfig.apiKey (CURSOR_API_KEY) is required to create a cloud agent");
  }
  const profile = resolveCloudProfile(config);
  const cloud = buildCloudOptions(config, profile);
  const agent = await Agent.create({
    apiKey: config.apiKey,
    model: { id: spec.modelId ?? config.modelId },
    name: spec.name,
    cloud,
  });
  return { agent, profile };
}

/**
 * Sends the prompt, streams events through `hooks`, and waits for the run to
 * finish. Validates envVars with assertSafeCloudEnvVars before every send —
 * this is the one call site where secrets could otherwise leak to the VM.
 */
export async function streamCloudRun(
  agent: CloudAgentHandle,
  prompt: string,
  envVars: Record<string, string>,
  hooks: SidearmHooks = {}
) {
  const onPhase = hooks.onPhase ?? logPhase;
  const onToolCall = hooks.onToolCall ?? logToolCall;

  assertSafeCloudEnvVars(envVars);
  onPhase("Sending prompt to cloud agent...");
  const run = await agent.send(prompt, { cloud: { envVars } });
  onPhase(`Run started: ${run.id}`);

  const transcript: string[] = [];
  const stopStatusWatch = run.onDidChangeStatus((status) => {
    onPhase(`run status → ${status}`);
  });

  try {
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") {
            if (hooks.onText) {
              hooks.onText(block.text);
            } else {
              process.stdout.write(block.text);
            }
            transcript.push(block.text);
          }
        }
      } else if (event.type === "status") {
        onPhase(`cloud ${event.status}${event.message ? `: ${event.message}` : ""}`);
      } else if (event.type === "tool_call") {
        onToolCall(event.name, event.status, event.args);
      } else if (event.type === "task" && event.text) {
        onPhase(`task: ${event.text}`);
      } else if (event.type === "usage" && event.usage) {
        onPhase(`tokens: ${event.usage.totalTokens} total`);
      }
    }
  } finally {
    stopStatusWatch();
  }

  const result = await run.wait();
  onPhase(`Run finished: ${result.status}`);
  return { result, transcript: transcript.join("") };
}

/**
 * Full job lifecycle: create the cloud agent, stream the run to completion,
 * list artifacts, optionally download them, and dispose the agent handle.
 * This is the sidearm's main entry point — apps supply the prompt and
 * envVars, and interpret `resultText` / `transcript` themselves (outcome
 * parsing is domain-specific and stays out of this package).
 */
export async function runCloudJob(
  spec: CloudJobSpec,
  config: SidearmConfig,
  hooks: SidearmHooks = {}
): Promise<CloudJobResult> {
  const onPhase = hooks.onPhase ?? logPhase;
  const { agent, profile } = await createCloudAgent(spec, config);
  onPhase(`Agent created: ${agent.agentId}`);

  try {
    const { result, transcript } = await streamCloudRun(agent, spec.prompt, spec.envVars, hooks);

    const artifacts: CloudArtifactRef[] = await agent.listArtifacts();
    let downloadedPaths: string[] = [];
    if (spec.artifactsDir) {
      const downloaded = await downloadCloudArtifacts(agent, spec.artifactsDir);
      downloadedPaths = downloaded.savedPaths;
    }

    return {
      agentId: agent.agentId,
      requestId: result.requestId,
      profile,
      status: result.status,
      transcript,
      resultText: result.result,
      durationMs: result.durationMs,
      artifacts,
      downloadedPaths,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

/** Lists recent cloud agents for this API key — thin wrapper over Agent.list({ runtime: "cloud" }). */
export async function listCloudAgents(config: SidearmConfig, limit = 20) {
  if (!config.apiKey) {
    throw new Error("SidearmConfig.apiKey (CURSOR_API_KEY) is required to list cloud agents");
  }
  return Agent.list({ runtime: "cloud", apiKey: config.apiKey, limit });
}
