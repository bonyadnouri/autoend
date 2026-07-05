# Autoend Cloud Adapter — Design

Medium-term design for running [`@hack-raise/autoend`](../apps/autoend) (vendored from the former
`bonyadnouri/autoend`) on a Cursor Cloud VM via the shared
[`@hack-raise/cursor-cloud-sidearm`](../packages/cursor-cloud-sidearm) package. This is a **design
document**, not yet implemented — the code referenced below is a reference implementation meant to
be dropped into `apps/autoend/src/cloud/`. autoend is now a hack-raise workspace member (merged via
`git subtree`); the monorepo's Node engine has been bumped to `>=23.6` to match autoend's runtime
requirement, so no separate Node version track is needed for build/typecheck/test. A separate saved
Cloud Agent environment may still be worth keeping for autoend's own cloud runs (isolating its
Playwright/agent-browser footprint from hack-raise's testbed snapshot), but it is no longer required
purely for Node version reasons.

See [Cloud Sidearm Extraction](../packages/cursor-cloud-sidearm/README.md) for the shared package
this design builds on, and the sibling doc [autoend-flow-map-sync-design.md](./autoend-flow-map-sync-design.md)
for how Flow Map mutations get back to the developer's machine after a cloud run.

## Goals

- Add a cloud run path to autoend (`autoend cloud <target>` or similar), additive to — never a
  replacement for — the existing local `autoend <url>` flow.
- Reuse the sidearm for profile resolution, safe env injection, agent lifecycle, and artifact
  download instead of re-deriving Cursor SDK plumbing inside autoend.
- Start with **one cloud agent running the full `executeRun()` pipeline** in a warm VM. Do not fan
  out autoend's internal explorer fleet (the `explorers` count in `EFFORT_BUDGETS`) into multiple
  Cloud Agents yet — that is a later optimization, not part of this slice.
- Treat cloud as CI-style: always pass `--no-serve`, always require `--effort`, never open a
  browser or expect a TTY on the VM.

## Non-goals (explicitly out of scope for this design)

- Fanning autoend's exploration fleet across multiple Cloud Agents.
- A real execution sandbox for LLM-authored `flow.mts` scripts (cloud reduces local-machine
  exposure but is not a sandboxing story by itself — see Key Risks below).
- Silently syncing `.autoend/flows/` from the VM back to the developer's machine (see the Flow
  Map sync design doc — that is deliberately a separate, explicit step).

## `AUTOEND_*` env contract

Mirrors the shape of hack-raise's `HACK_RAISE_*` contract (see
[cloud-agents.md](./cloud-agents.md#per-run-env-vars)): a flat set of non-secret vars injected via
`agent.send(prompt, { cloud: { envVars } })`, validated with the sidearm's
`assertSafeCloudEnvVars` before every send.

| Env var | Required | Purpose |
| --- | --- | --- |
| `AUTOEND_RUN_ID` | yes | Stable run id, becomes `.autoend/runs/<runId>/`. Mint with the sidearm's `newRunId()`. |
| `AUTOEND_TARGET` | yes | URL under test. Must pass the [target reachability rules](#target-reachability-rules) below. |
| `AUTOEND_EFFORT` | yes | One of `low \| mid \| high \| xhigh \| ultra` (`src/run/effort.ts`). Cloud runs should default to `low` or `mid` — `xhigh`/`ultra` budgets (10–30 min of exploration) are expensive to run unattended per invocation. |
| `AUTOEND_ARTIFACT_DIR` | no | Overrides the default `.autoend/runs/<runId>/` root, for parity with `HACK_RAISE_ARTIFACT_DIR`. |
| `AUTOEND_NO_SERVE` | yes (`"1"`) | Forces `--no-serve`. The thin runner should hardcode this rather than trust the agent to remember the flag — cloud VMs have no browser and no interactive terminal. |
| `AUTOEND_FLOW_SYNC_MODE` | no | `"none" \| "delta"` (default `"delta"`). See the Flow Map sync design doc — `"none"` skips Flow Map mutation entirely (replay-only, exploration disabled) for a strictly read-only smoke check. |

Explicitly **not** an env var, by the same rule hack-raise already enforces: `CURSOR_API_KEY`. See
[CURSOR_API_KEY handling](#cursor_api_key-handling) — autoend's cloud worker needs its own answer
here, since (unlike hack-raise) autoend's in-VM process itself creates a nested Cursor SDK agent
for exploration.

## Cloud prompt

Adapted from hack-raise's `buildPlaywrightPrompt` / `buildSmokePrompt`
(`packages/cursor-orchestrator/src/prompts.ts`) — profile-aware, thin-runner-first, and explicit
about what the agent must **not** do:

```ts
// autoend/src/cloud/prompt.ts (reference; not yet added to autoend)
import type { CloudProfile } from "@hack-raise/cursor-cloud-sidearm";

export function buildAutoendCloudPrompt(profile: CloudProfile): string {
  const setupBlock =
    profile === "cloud-env"
      ? `Setup: dependencies (including agent-browser and Playwright) are pre-installed in this saved environment snapshot. Do NOT run npm install or npx playwright install unless a command fails with "module not found".`
      : `Setup: this is a cold checkout. Run \`npm install\` and \`npx playwright install --with-deps chromium\` once, then proceed.`;

  return `You are running an autoend Run non-interactively on a Cursor Cloud VM.

${setupBlock}

Read these env vars from your shell before doing anything else — do not ask the user for them,
they are already set: AUTOEND_RUN_ID, AUTOEND_TARGET, AUTOEND_EFFORT, AUTOEND_ARTIFACT_DIR
(optional), AUTOEND_FLOW_SYNC_MODE (optional).

Run exactly:
  bash scripts/run-autoend-cloud.sh

Do not run \`autoend init\` — there is no TTY on this VM and no config wizard input is available.
Do not pass --no-open or --port — the thin runner already sets --no-serve and a fixed port.
Do not attempt to open a browser or start a viewer server.

When the script finishes, report:
- The exit code.
- The path to report.json under .autoend/runs/\${AUTOEND_RUN_ID}/.
- The finding counts by kind (hard-failure / regression / advisory) from report.json.
- Whether flowDeltas.json was written (see AUTOEND_FLOW_SYNC_MODE) and its path if so.
Do not summarize or paraphrase report.json contents beyond counts — the artifact itself is the
source of truth once downloaded locally.`;
}
```

This mirrors two hack-raise conventions worth keeping: (1) the prompt tells the agent to run a
*thin script*, not to reimplement steps inline, and (2) the prompt is explicit about what NOT to
do (no wizard, no browser, no viewer) — the same pattern that keeps hack-raise's cloud runs from
accidentally reinstalling dependencies on warm snapshots.

## Cloud thin runner

A cloud-oriented sibling of the existing local script
(`/Users/moiz/Documents/code/hack-raise/scripts/run-autoend.sh`), which itself is a useful
reference for the "already configured, don't rerun setup" pattern hack-raise validated with
`scripts/run-cloud-scenario.sh`. The cloud version differs in three ways: it never invokes
`autoend init`, it always forces `--no-serve`, and it enforces the reachability rule below before
running anything.

```bash
#!/usr/bin/env bash
# autoend/scripts/run-autoend-cloud.sh (reference; not yet added to autoend)
# Runs one autoend Run non-interactively on a Cursor Cloud VM. Never opens a
# browser, never starts the viewer server, never prompts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${AUTOEND_RUN_ID:?AUTOEND_RUN_ID is required}"
: "${AUTOEND_TARGET:?AUTOEND_TARGET is required}"
: "${AUTOEND_EFFORT:?AUTOEND_EFFORT is required}"

case "${AUTOEND_TARGET}" in
  http://localhost*|http://127.0.0.1*|https://localhost*|https://127.0.0.1*)
    echo "ERROR: AUTOEND_TARGET (${AUTOEND_TARGET}) is a localhost address." >&2
    echo "Cloud runs cannot reach the developer's machine. Use a staging/preview/tunnel URL." >&2
    exit 2
    ;;
esac

if ! curl -sf --max-time 10 "${AUTOEND_TARGET}" >/dev/null 2>&1; then
  echo "ERROR: AUTOEND_TARGET (${AUTOEND_TARGET}) is not reachable from this VM." >&2
  exit 2
fi

mkdir -p ".autoend"
cat > .autoend/config.json <<EOF
{
  "target": "${AUTOEND_TARGET}",
  "effort": "${AUTOEND_EFFORT}"
}
EOF

# --no-open is implied by --no-serve (no viewer process = nothing to open),
# kept explicit for readers.
node dist/cli.js "${AUTOEND_TARGET}" -e "${AUTOEND_EFFORT}" --no-serve --no-open

if [[ "${AUTOEND_FLOW_SYNC_MODE:-delta}" == "delta" ]]; then
  node dist/cloud/write-flow-deltas.js \
    --run-id "${AUTOEND_RUN_ID}" \
    --out ".autoend/runs/${AUTOEND_RUN_ID}/flowDeltas.json"
fi
```

`dist/cloud/write-flow-deltas.js` is the tool described in the Flow Map sync design doc — it
diffs `.autoend/flows/` as it stood before the Run against the state after, without ever
overwriting the local machine's Flow Map directly.

## Target reachability rules

Localhost targets categorically do not work in cloud mode — the whole point of a Cursor Cloud VM
is that it is not the developer's machine. Rules, enforced in this order:

1. **Reject on sight.** `run-autoend-cloud.sh` pattern-matches `AUTOEND_TARGET` against
   `localhost` / `127.0.0.1` (any port, http or https) and exits `2` immediately, before doing
   any setup work. This is a fast, cheap check that fails loudly instead of silently exploring
   nothing.
2. **Require an explicit reachable URL.** Acceptable `AUTOEND_TARGET` values for the medium term:
   - A staging or preview deployment URL (Vercel/Netlify preview, a long-lived staging env).
   - A tunnel URL (ngrok, Cloudflare Tunnel, `cloudflared`) pointed at a local dev server, set up
     by the developer *before* launching the cloud agent. Autoend cloud mode does not manage
     tunnels itself in this design — that is a fourth env var (`AUTOEND_TUNNEL_*`) worth adding
     only once there's a concrete need.
3. **Verify reachability before running anything expensive.** `curl -sf --max-time 10` against
   the target before touching autoend at all — same shape as
   `run-autoend.sh`'s existing `curl .../__testbed/contract.json` check, generalized to any HTTP
   target since autoend (unlike hack-raise's testpad) has no fixed contract endpoint to probe.
4. **Fail the job, not just the check.** A reachability failure should end the agent run with a
   non-zero exit and a clear message in the transcript — not fall through to `executeRun()` with
   a target that will 100% time out during exploration (wasting the effort budget for nothing).

## `CURSOR_API_KEY` handling

This is the one place autoend's cloud story is structurally harder than hack-raise's, and it's
worth being explicit about why. Hack-raise's cloud agent runs `pnpm test:e2e` — a deterministic
Playwright runner with **no LLM calls of its own**. Autoend's `executeRun()` calls
`Agent.create({ local: { cwd } })` internally during the explore phase (`src/explore/explorer.ts`)
— the in-VM process itself needs to authenticate as a Cursor SDK caller, not just run a static
script.

hack-raise's existing invariant — `CURSOR_API_KEY` never crosses into `cloud.envVars` — has to
hold for autoend too (the sidearm's `assertSafeCloudEnvVars` enforces this automatically since any
`CURSOR_` prefixed key is rejected). That leaves two real options for the autoend cloud worker's
own key:

| Option | How it works | Trade-off |
| --- | --- | --- |
| **Cursor Cloud Secrets** (recommended) | Register a secret (e.g. `AUTOEND_CURSOR_API_KEY`, deliberately *not* `CURSOR_`-prefixed so it can pass the sidearm's env-var guard if it ever needs to be referenced by name) in the Cursor dashboard, scoped to the environment/snapshot the autoend cloud job uses. The in-VM autoend process reads it directly from its own process env — never injected through `cloud.envVars` at all, since Cloud Secrets are separate from per-run `envVars` and are the sanctioned mechanism for exactly this. | Requires one-time dashboard setup per environment, same class of work as hack-raise's `cloud-env` snapshot setup ([cloud-env-setup.md](./cloud-env-setup.md)). |
| **Different execution model** | Run autoend's explore phase against a model that doesn't require nested `Agent.create()` (e.g. a lighter, directly-called LLM API for flow proposal, bypassing `agent-browser`'s Cursor SDK dependency). | Bigger product change to autoend itself — `agent-browser` is core to ADR-0003 ("Cursor SDK as agent harness"); not realistic for this medium-term slice. |

Recommendation: **Cloud Secrets**, not a `--no-serve`-only degraded mode. A cloud run that can't
explore (only replay the existing Flow Map) is a materially different, weaker feature than what
local autoend offers, and defeats the point of a cloud adapter.

## Node version (resolved)

autoend requires Node **≥23.6** (native TS type-stripping for `.mts` flow scripts). Since autoend
was merged into the hack-raise workspace, the monorepo's Node engine — root `package.json`
`engines.node`, `scripts/check-node-version.mjs`, `.github/workflows/ci.yml`, and
`.cursor/Dockerfile` — has been bumped to `>=23.6` to match. `AGENTS.md` and
[cloud-agents.md](./cloud-agents.md) are updated accordingly. This means the shared hack-raise cloud
snapshot ([`.cursor/environment.json`](../.cursor/environment.json)) already satisfies autoend's
runtime requirement — a separate `autoend-cloud` Node version track is no longer needed. A distinct
saved environment may still be worth creating for autoend's own cloud runs purely to isolate its
`agent-browser`/Playwright footprint from hack-raise's testbed snapshot, but that is now an
optimization, not a hard requirement.

## How this maps onto the sidearm

Pseudocode for the (not-yet-written) `autoend/src/cloud/run.ts`, showing which sidearm primitives
this design relies on — all already implemented and unit-tested in
[`packages/cursor-cloud-sidearm`](../packages/cursor-cloud-sidearm):

```ts
import {
  assertSafeCloudEnvVars,
  createCloudAgent,
  downloadCloudArtifacts,
  loadSidearmConfig,
  newRunId,
  resolveCloudProfile,
  resolveModelId,
  streamCloudRun,
} from "@hack-raise/cursor-cloud-sidearm";
import { buildAutoendCloudPrompt } from "./prompt.js";

export async function runAutoendCloud(target: string, effort: string) {
  const config = loadSidearmConfig({ profileOverrideEnv: "AUTOEND_PROFILE" });
  if (!config.apiKey) throw new Error("CURSOR_API_KEY is required (local orchestrator only)");

  const modelId = await resolveModelId(config);
  const runId = newRunId(process.env.AUTOEND_RUN_ID);
  const profile = resolveCloudProfile(config);
  const envVars = {
    AUTOEND_RUN_ID: runId,
    AUTOEND_TARGET: target,
    AUTOEND_EFFORT: effort,
    AUTOEND_NO_SERVE: "1",
  };
  assertSafeCloudEnvVars(envVars); // fails fast on any accidental CURSOR_*/secret-like var

  const { agent } = await createCloudAgent(
    { name: `autoend-cloud-${runId.slice(0, 8)}`, prompt: buildAutoendCloudPrompt(profile), envVars, modelId },
    config
  );
  try {
    const { result, transcript } = await streamCloudRun(agent, buildAutoendCloudPrompt(profile), envVars);
    const { savedPaths } = await downloadCloudArtifacts(agent, `.autoend/cloud-artifacts/${runId}`);
    return { result, transcript, savedPaths };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}
```

This is deliberately the same call shape as hack-raise's own adapter
(`packages/cursor-orchestrator/src/cli.ts`) — both apps use the sidearm's primitives directly
rather than the higher-level `runCloudJob()` convenience wrapper, because both need an
agent-id-scoped artifact directory that isn't known until after `createCloudAgent()` returns.

## Validation plan for this slice

- [ ] Cloud environment used for autoend runs has `agent-browser` + Playwright pre-installed (the
      shared hack-raise snapshot already satisfies the Node `>=23.6` requirement; a dedicated
      `autoend-cloud` environment is optional isolation, not a version requirement).
- [ ] `AUTOEND_CURSOR_API_KEY` (or equivalent) registered as a Cursor Cloud Secret on that
      environment, readable by the in-VM autoend process without crossing `cloud.envVars`.
- [ ] `run-autoend-cloud.sh` rejects a `localhost` target with exit code 2 and no autoend
      invocation.
- [ ] One cloud Run against a real staging/tunnel URL produces a valid `report.json` under
      `.autoend/runs/<runId>/` with `--no-serve`.
- [ ] Downloaded `report.json` + `evidence/` can be served locally via autoend's existing
      `serveReport()` without requiring the cloud VM to still be alive.
- [ ] `flowDeltas.json` (or `AUTOEND_FLOW_SYNC_MODE=none`) behaves per the
      [Flow Map sync design](./autoend-flow-map-sync-design.md) — no direct overwrite of local
      `.autoend/flows/` happens as a side effect of running this script.
