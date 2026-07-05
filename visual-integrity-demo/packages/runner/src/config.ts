import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BugFindingSchema,
  RunArtifactSchema,
  RunManifestSchema,
  ScenarioRunSchema,
  type BugFinding,
  type RunArtifact,
  type RunManifest,
  type ScenarioRun,
} from "@hack-raise/graph-core";
import {
  getScenarioById,
  SCENARIOS,
  TESTPAD_CONTRACT,
} from "@hack-raise/graph-core/fixtures";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export interface RunnerConfig {
  runId: string;
  scenarioId?: string;
  role?: string;
  baseUrl?: string;
  artifactDir: string;
  startApp: boolean;
  port: number;
}

export function resolveRunnerConfig(argv: string[]): RunnerConfig {
  const args = parseArgs(argv);
  const envRunId = process.env.HACK_RAISE_RUN_ID;
  const envScenarioId = process.env.HACK_RAISE_SCENARIO_ID;
  const envRole = process.env.HACK_RAISE_ROLE;
  const envBaseUrl = process.env.HACK_RAISE_TESTPAD_BASE_URL;
  const envArtifactDir =
    process.env.HACK_RAISE_ARTIFACT_DIR ?? ".hack-raise/runs";

  if (args.scenario && envScenarioId && args.scenario !== envScenarioId) {
    throw new Error(
      `Scenario mismatch: CLI=${args.scenario} env=${envScenarioId}`
    );
  }
  if (args.role && envRole && args.role !== envRole) {
    throw new Error(`Role mismatch: CLI=${args.role} env=${envRole}`);
  }
  if (args.baseUrl && envBaseUrl && args.baseUrl !== envBaseUrl) {
    throw new Error(`Base URL mismatch: CLI=${args.baseUrl} env=${envBaseUrl}`);
  }

  return {
    runId: args.runId ?? envRunId ?? randomUUID(),
    scenarioId: args.scenario ?? envScenarioId,
    role: args.role ?? envRole,
    baseUrl: args.baseUrl ?? envBaseUrl,
    artifactDir: path.resolve(repoRoot, args.artifactDir ?? envArtifactDir),
    startApp: !args.noStartApp && !args.baseUrl && !envBaseUrl,
    port: args.port ?? 3100,
  };
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean | number | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario") out.scenario = argv[++i];
    else if (arg === "--run-id") out.runId = argv[++i];
    else if (arg === "--role") out.role = argv[++i];
    else if (arg === "--base-url") out.baseUrl = argv[++i];
    else if (arg === "--artifact-dir") out.artifactDir = argv[++i];
    else if (arg === "--port") out.port = Number(argv[++i]);
    else if (arg === "--no-start-app") out.noStartApp = true;
    else if (arg === "--help") out.help = true;
  }
  return out as {
    scenario?: string;
    runId?: string;
    role?: string;
    baseUrl?: string;
    artifactDir?: string;
    port?: number;
    noStartApp?: boolean;
    help?: boolean;
  };
}

export async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function registerFileArtifact(
  artifactDir: string,
  runId: string,
  scenarioId: string,
  kind: RunArtifact["kind"],
  filename: string,
  filePath: string,
  mimeType?: string
): Promise<RunArtifact> {
  const sha256 = await sha256File(filePath);
  const artifact = RunArtifactSchema.parse({
    artifactId: `${scenarioId}-${kind}-${filename}`,
    kind,
    path: filePath,
    mimeType,
    sha256,
    scenarioId,
    createdAt: new Date().toISOString(),
    redactionStatus: "none",
  });
  return artifact;
}

export async function writeArtifact(
  artifactDir: string,
  runId: string,
  scenarioId: string,
  kind: RunArtifact["kind"],
  filename: string,
  content: Buffer | string,
  mimeType?: string
): Promise<RunArtifact> {
  const dir = path.join(artifactDir, runId, scenarioId);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, content);
  const sha256 = createHash("sha256")
    .update(typeof content === "string" ? content : content)
    .digest("hex");
  const artifact = RunArtifactSchema.parse({
    artifactId: `${scenarioId}-${kind}-${filename}`,
    kind,
    path: fullPath,
    mimeType,
    sha256,
    scenarioId,
    createdAt: new Date().toISOString(),
    redactionStatus: "none",
  });
  return artifact;
}

export async function writeManifest(
  artifactDir: string,
  manifest: RunManifest
): Promise<string> {
  const validated = RunManifestSchema.parse(manifest);
  const dir = path.join(artifactDir, manifest.runId);
  await mkdir(dir, { recursive: true });
  const manifestPath = path.join(dir, "run-manifest.json");
  await writeFile(manifestPath, JSON.stringify(validated, null, 2));
  return manifestPath;
}

export function getScenariosToRun(scenarioId?: string) {
  if (scenarioId) {
    const scenario = getScenarioById(scenarioId);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioId}`);
    }
    return [scenario];
  }
  return SCENARIOS;
}

export function getUserForRole(role: "user" | "admin") {
  const user = TESTPAD_CONTRACT.users.find((u) => u.role === role);
  if (!user) throw new Error(`No user for role ${role}`);
  return user;
}

export function buildFinding(
  bugId: string,
  artifactIds: string[],
  message?: string
): BugFinding {
  return BugFindingSchema.parse({
    findingId: `${bugId}-${Date.now()}`,
    bugId,
    severity: bugId === "BUG_ADMIN_AUTHZ" ? "critical" : "high",
    classification: "seeded_bug_reproduced",
    evidenceArtifactIds: artifactIds,
    message,
  });
}

export function finalizeScenarioRun(run: ScenarioRun): ScenarioRun {
  return ScenarioRunSchema.parse(run);
}

export function printHelp() {
  console.log(`Usage: pnpm test:e2e -- [options]

Options:
  --scenario <id>       Run one scenario (default: all)
  --run-id <id>         Stable run identifier
  --role <user|admin>   Expected role (must match env if set)
  --base-url <url>      External testpad URL (skips app startup)
  --artifact-dir <dir>  Output directory (default: .hack-raise/runs)
  --port <number>       Testpad port when starting locally (default: 3100)
  --no-start-app        Do not spawn testpad (requires --base-url)
  --help                Show help

Scenarios:
${SCENARIOS.map((s) => `  - ${s.scenarioId}`).join("\n")}
`);
}
