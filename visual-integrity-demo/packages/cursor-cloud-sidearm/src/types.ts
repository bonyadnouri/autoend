import type { CloudAgentOptions, RunResultStatus } from "@cursor/sdk";

/**
 * Cloud boot modes the sidearm knows how to translate into CloudAgentOptions.
 * "local-dev" is a valid SidearmConfig.profile but is never a CloudProfile —
 * callers must refuse to launch a cloud job while on local-dev.
 */
export type CloudProfile = "cloud-repo" | "cloud-env";

export type SidearmProfile = CloudProfile | "local-dev";

export interface SidearmConfig {
  /** CURSOR_API_KEY — local orchestrator only. Never forward this into a cloud job's envVars. */
  apiKey?: string;
  /** CURSOR_REPO_URL — required for the cloud-repo profile. */
  repoUrl?: string;
  /** CURSOR_STARTING_REF — defaults to "main". */
  startingRef?: string;
  /** CURSOR_CLOUD_ENV_NAME — required for the cloud-env profile. */
  cloudEnvName?: string;
  /** CURSOR_MODEL_ID, or an app-supplied default. */
  modelId: string;
  profile: SidearmProfile;
}

export interface LoadSidearmConfigOptions {
  /**
   * Name of an app-specific env var that can force the resolved profile
   * (e.g. "HACK_RAISE_PROFILE"). Falls back to inference from
   * CURSOR_CLOUD_ENV_NAME / CURSOR_REPO_URL when unset or empty.
   */
  profileOverrideEnv?: string;
  /** Default model id when CURSOR_MODEL_ID is unset. Defaults to "composer-2.5". */
  defaultModelId?: string;
}

export interface CloudArtifactRef {
  path: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface SidearmHooks {
  /** Coarse-grained lifecycle progress (agent created, run started, status changes, ...). */
  onPhase?: (message: string) => void;
  /** One call per tool-call event streamed from the run. */
  onToolCall?: (name: string, status: string, args?: unknown) => void;
  /** One call per assistant text chunk as it streams in. When omitted, text is written to stdout (matches prior CLI behavior). */
  onText?: (text: string) => void;
}

export interface CloudJobSpec {
  /** Human-readable agent title, surfaced in the Cursor dashboard. */
  name: string;
  /** Static instructions only — the sidearm never inspects or rewrites prompt content. */
  prompt: string;
  /** Injected into the cloud VM via agent.send(prompt, { cloud: { envVars } }); validated with assertSafeCloudEnvVars before sending. */
  envVars: Record<string, string>;
  runId?: string;
  /** Overrides SidearmConfig.modelId for this job only. */
  modelId?: string;
  /** When set, cloud artifacts are downloaded here after the run completes. Omit to skip download and just get the listing. */
  artifactsDir?: string;
}

export interface CloudJobResult {
  agentId: string;
  requestId?: string;
  profile: CloudProfile;
  /**
   * Raw SDK run outcome ("finished" | "error" | "cancelled") — this is the
   * agent's own completion state, not a domain pass/fail judgment. Apps
   * derive their own scenario/run outcome from `transcript` / `resultText`.
   */
  status: RunResultStatus;
  transcript: string;
  resultText?: string;
  durationMs?: number;
  artifacts: CloudArtifactRef[];
  downloadedPaths: string[];
}

export interface SidearmEnvCheckReport {
  profile: SidearmProfile;
  apiKeyPresent: boolean;
  cloudOptionsOk: boolean;
  cloudOptionsError?: string;
  apiAuthOk?: boolean;
  apiAuthError?: string;
  modelCount?: number;
  preferredModelAvailable?: boolean;
}

export type { CloudAgentOptions, RunResultStatus };
