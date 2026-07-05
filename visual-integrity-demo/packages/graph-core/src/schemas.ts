import { z } from "zod";

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "error",
  "cancelled",
]);

export const ArtifactKindSchema = z.enum([
  "screenshot",
  "trace",
  "video",
  "har",
  "console_log",
  "network_log",
  "run_manifest",
  "events",
  "other",
]);

export const RedactionStatusSchema = z.enum(["none", "partial", "full"]);

export const SeededBugSchema = z.object({
  bugId: z.string(),
  route: z.string(),
  trigger: z.string(),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  requiredArtifacts: z.array(ArtifactKindSchema),
});

export const ScenarioSpecSchema = z.object({
  scenarioId: z.string(),
  role: z.enum(["user", "admin"]),
  startPath: z.string(),
  steps: z.array(z.string()),
  expectedFindings: z.array(z.string()),
});

export const BugFindingSchema = z.object({
  findingId: z.string(),
  bugId: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  classification: z.string(),
  evidenceArtifactIds: z.array(z.string()),
  message: z.string().optional(),
});

export const RunArtifactSchema = z.object({
  artifactId: z.string(),
  kind: ArtifactKindSchema,
  path: z.string(),
  mimeType: z.string().optional(),
  sha256: z.string().optional(),
  scenarioId: z.string().optional(),
  createdAt: z.string(),
  redactionStatus: RedactionStatusSchema.default("none"),
});

export const ScenarioRunSchema = z.object({
  scenarioId: z.string(),
  role: z.enum(["user", "admin"]),
  baseUrl: z.string().url(),
  status: RunStatusSchema,
  findings: z.array(BugFindingSchema),
  artifacts: z.array(RunArtifactSchema),
  eventsPath: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export const RunManifestSchema = z.object({
  runId: z.string(),
  target: z.object({
    name: z.string(),
    baseUrl: z.string().url().optional(),
    repoUrl: z.string().optional(),
    ref: z.string().optional(),
  }),
  scenarioRuns: z.array(ScenarioRunSchema),
  createdAt: z.string(),
  status: RunStatusSchema,
});

export const AgentRunRecordSchema = z.object({
  agentId: z.string(),
  runId: z.string(),
  requestId: z.string().optional(),
  profile: z.enum(["local-dev", "cloud-repo", "cloud-env", "cloud-pr"]),
  status: RunStatusSchema,
  result: z.string().optional(),
  artifacts: z.array(RunArtifactSchema).default([]),
  repoRef: z.string().optional(),
  environmentName: z.string().optional(),
  durationMs: z.number().optional(),
});

export const TestbedUserSchema = z.object({
  email: z.string(),
  password: z.string(),
  role: z.enum(["user", "admin"]),
});

export const TestbedContractSchema = z.object({
  version: z.string(),
  baseUrl: z.string().url().optional(),
  users: z.array(TestbedUserSchema),
  routes: z.array(
    z.object({
      path: z.string(),
      label: z.string(),
      roles: z.array(z.enum(["user", "admin", "anonymous"])),
    })
  ),
  seededBugs: z.array(SeededBugSchema),
  scenarios: z.array(ScenarioSpecSchema),
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type SeededBug = z.infer<typeof SeededBugSchema>;
export type ScenarioSpec = z.infer<typeof ScenarioSpecSchema>;
export type BugFinding = z.infer<typeof BugFindingSchema>;
export type RunArtifact = z.infer<typeof RunArtifactSchema>;
export type ScenarioRun = z.infer<typeof ScenarioRunSchema>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
export type AgentRunRecord = z.infer<typeof AgentRunRecordSchema>;
export type TestbedContract = z.infer<typeof TestbedContractSchema>;
