# `@hack-raise/cursor-cloud-sidearm`

Reusable Cursor Cloud Agent orchestration: profile resolution, safe env-var injection, run
lifecycle (create → stream → wait → list/download artifacts), and env-check helpers. No scenario
registry, no domain env vars, no outcome parsing — those stay in the consuming app.

Extracted from `@hack-raise/cursor-orchestrator` as part of a medium-term extraction plan so both
hack-raise and (eventually) [`@hack-raise/autoend`](../../apps/autoend) can launch Cursor Cloud
Agents without duplicating profile/env/lifecycle plumbing. See
[docs/autoend-cloud-adapter-design.md](../../docs/autoend-cloud-adapter-design.md) for how autoend
is expected to consume this package.

## What lives here

- `types.ts` — `SidearmConfig`, `CloudJobSpec`, `CloudJobResult`, hooks, and related types.
- `env.ts` — `loadSidearmConfig`, `assertSafeCloudEnvVars`, `redactForSummary`, `newRunId`.
- `cloud-profiles.ts` — `buildCloudOptions`, `resolveCloudProfile` (`cloud-repo` / `cloud-env`).
- `lifecycle.ts` — `createCloudAgent`, `streamCloudRun`, `runCloudJob`, `resolveModelId`,
  `listCloudAgents`.
- `artifacts.ts` — `downloadCloudArtifacts`, `sanitizeArtifactPath`.
- `env-check.ts` — `checkSidearmEnvironment`, returns structured data; apps own their own
  printing/formatting.
- `progress.ts` — `logPhase` / `logToolCall`, the default console-based hooks used when a caller
  doesn't supply its own.

## What does NOT live here

App-specific concerns stay in the consuming package:

- Scenario/fixture registries (hack-raise's `SCENARIOS`).
- App-namespaced env var builders (hack-raise's `HACK_RAISE_*`, autoend's future `AUTOEND_*`).
- Prompt content (each app's cloud prompt is domain-specific).
- Outcome parsing / persistence (hack-raise's `BUG_*` detection and `AgentRunRecordSchema`).

## Two ways to use it

**Low-level primitives** — when the artifact download directory depends on the agent id (only
known after creation), or you need fine control between steps:

```ts
import { createCloudAgent, streamCloudRun, downloadCloudArtifacts } from "@hack-raise/cursor-cloud-sidearm";

const { agent, profile } = await createCloudAgent(spec, config);
try {
  const { result, transcript } = await streamCloudRun(agent, spec.prompt, spec.envVars);
  const { savedPaths } = await downloadCloudArtifacts(agent, `.myapp/cloud-artifacts/${agent.agentId}`);
} finally {
  await agent[Symbol.asyncDispose]();
}
```

**`runCloudJob` convenience wrapper** — when a static `artifactsDir` (known up front) is enough:

```ts
import { runCloudJob } from "@hack-raise/cursor-cloud-sidearm";

const result = await runCloudJob(
  { name: "my-job", prompt, envVars, artifactsDir: "./artifacts/my-run" },
  config
);
```

`@hack-raise/cursor-orchestrator` (this repo's hack-raise adapter) uses the low-level primitives,
since it needs `<runId>/<agentId>` scoped artifact directories.

## Safety invariant

`assertSafeCloudEnvVars` rejects any `CURSOR_`-prefixed key and anything that looks like a secret
(key/token/secret in the name or `token=`/`key=`/`secret=` in the value) before it can be injected
into `cloud.envVars`. `CURSOR_API_KEY` stays on the local orchestrator; it is never forwarded to
the cloud VM through this path. Apps whose in-VM process needs its own Cursor SDK credentials
(e.g. autoend's nested `Agent.create()` during exploration) should use Cursor Cloud Secrets
instead — see the autoend cloud adapter design doc for the concrete recommendation.

## Testing

```bash
pnpm --filter @hack-raise/cursor-cloud-sidearm test
```

Tests mock `@cursor/sdk` entirely — no `CURSOR_API_KEY` or network access required.
