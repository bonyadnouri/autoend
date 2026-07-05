import {
  createCloudAgent,
  downloadCloudArtifacts,
  resolveCloudProfile,
  resolveModelId,
  streamCloudRun,
  type CloudProfile,
  type RunResultStatus,
} from '@hack-raise/cursor-cloud-sidearm';
import { buildAutoendEnvVars, loadAutoendCloudConfig, newAutoendRunId } from './env.js';
import { buildAutoendCloudPrompt } from './prompt.js';
import { cloudArtifactsDirFor, persistCloudTranscript } from './persist.js';

export interface RunAutoendCloudOptions {
  /** Local working directory — used only for where local records land, never sent to the VM. */
  repoRoot: string;
  target: string;
  effort: string;
  artifactDir?: string;
  flowSyncMode?: string;
  /** Overrides the minted run id (e.g. an orchestrator-provided id). */
  runId?: string;
}

export interface RunAutoendCloudResult {
  runId: string;
  agentId: string;
  profile: CloudProfile;
  /** Raw SDK run outcome, not a domain pass/fail judgment — inspect report.json for that. */
  status: RunResultStatus;
  transcriptPath: string;
  cloudArtifactsDir: string;
  savedPaths: string[];
  resultText?: string;
}

/**
 * Launches exactly one Cursor Cloud Agent that runs the autoend pipeline
 * against `target` on a VM, via apps/autoend/scripts/run-autoend-cloud.sh.
 * Never touches local .autoend/flows/ — Flow Map sync is a separate, explicit
 * step (see docs/autoend-flow-map-sync-design.md).
 */
export async function runAutoendCloud(opts: RunAutoendCloudOptions): Promise<RunAutoendCloudResult> {
  const config = loadAutoendCloudConfig();
  if (!config.apiKey) {
    throw new Error('CURSOR_API_KEY is required (local orchestrator only — never sent to the cloud VM)');
  }
  if (config.profile === 'local-dev') {
    throw new Error(
      'autoend cloud requires a cloud profile. Set CURSOR_REPO_URL (cloud-repo) or CURSOR_CLOUD_ENV_NAME (cloud-env).'
    );
  }

  const profile = resolveCloudProfile(config);
  const modelId = await resolveModelId(config);
  const runId = newAutoendRunId(opts.runId);
  const envVars = buildAutoendEnvVars({
    runId,
    target: opts.target,
    effort: opts.effort,
    artifactDir: opts.artifactDir,
    flowSyncMode: opts.flowSyncMode,
  });
  const prompt = buildAutoendCloudPrompt(profile);

  const { agent, profile: resolvedProfile } = await createCloudAgent(
    { name: `autoend-cloud-${runId.slice(0, 8)}`, prompt, envVars, modelId },
    config
  );

  try {
    const { result, transcript } = await streamCloudRun(agent, prompt, envVars);

    const cloudArtifactsDir = cloudArtifactsDirFor(opts.repoRoot, runId);
    const { savedPaths } = await downloadCloudArtifacts(agent, cloudArtifactsDir);
    const transcriptPath = await persistCloudTranscript(opts.repoRoot, runId, agent.agentId, transcript);

    return {
      runId,
      agentId: agent.agentId,
      profile: resolvedProfile,
      status: result.status,
      transcriptPath,
      cloudArtifactsDir,
      savedPaths,
      resultText: result.result,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}
