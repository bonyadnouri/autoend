# Cursor Cloud Agents — Hack Raise Testbed

This guide covers reproducible Cloud Agent runs for the deterministic testpad and Playwright runner.

The generic Cursor SDK plumbing (profiles, safe env injection, agent lifecycle, artifact download)
lives in [`packages/cursor-cloud-sidearm`](../packages/cursor-cloud-sidearm), extracted out of
`cursor-orchestrator` so other apps can reuse it — see
[autoend-cloud-adapter-design.md](./autoend-cloud-adapter-design.md) for the second consumer this
was designed for.

**Status:** All 4 Playwright scenarios verified in cloud (`pnpm agents:cloud`) — each reproduces its seeded bug.

## Prerequisites

- Node.js **>= 23.6** locally
- Cursor account with Cloud Agents enabled
- GitHub (or other supported SCM) connected in Cursor dashboard
- `CURSOR_API_KEY` from Cursor settings (local orchestrator only)

## Repository defaults

Committed setup lives in:

- `.cursor/environment.json` — idempotent install command
- `.cursor/Dockerfile` — Node 23.6+ base with Playwright deps
- `AGENTS.md` — agent instructions for scenario runs

The runner starts the testpad during execution. Avoid double-starting the dev server from environment terminals.

## Playwright scenarios

| Scenario ID | Command | Expected bug |
| --- | --- | --- |
| `user-dashboard-next` | `pnpm agents:cloud user-dashboard-next` | `BUG_NEXT_INERT` |
| `user-admin-authz` | `pnpm agents:cloud user-admin-authz` | `BUG_ADMIN_AUTHZ` |
| `user-task-create` | `pnpm agents:cloud user-task-create` | `BUG_TASK_CREATE_500` |
| `user-broken-link` | `pnpm agents:cloud user-broken-link` | `BUG_BROKEN_PROJECT_LINK` |

Each full cloud run timing depends on profile:

| Profile | Typical wall time | When to use |
| --- | --- | --- |
| `cloud-repo` (cold) | **~10–15 min** | First run, new branch, no saved snapshot |
| `cloud-env` (warm snapshot) | **~2–5 min** | Repeat runs after dashboard snapshot setup |
| First snapshot build | **~10 min once** | One-time cost when creating saved environment |

Do not cancel early — slow, not stuck. Timings logged to `docs/cloud-timing.log`; see [cloud-timing-baseline.md](./cloud-timing-baseline.md).

### Speed optimization (Phase 2.5)

Committed config for Cursor snapshot caching:

- [`.cursor/environment.json`](../.cursor/environment.json) — `build.dockerfile` + cached `install` (pnpm, graph-core/runner build, Playwright)
- [`scripts/run-cloud-scenario.sh`](../scripts/run-cloud-scenario.sh) — thin runner (Playwright only; agent should not reinstall)
- Profile-aware prompts — warm `cloud-env` skips install steps

**To get fast runs:** create a saved environment — see [cloud-env-setup.md](./cloud-env-setup.md).

## Secrets

| Secret | Where | Notes |
| --- | --- | --- |
| `CURSOR_API_KEY` | Local shell / CI | Never pass to cloud `envVars` |
| Future Grafana/NVIDIA tokens | Cursor Cloud Secrets | Not required for this slice |

Use Cursor dashboard **Secrets** for sensitive third-party credentials. Do not commit `.env.local` snapshots with secrets.

## Run profiles

### `local-dev`

No Cloud Agent. Run Playwright locally:

```bash
pnpm install
pnpm test:e2e -- --scenario user-dashboard-next
```

### `cloud-repo`

Clone the repo fresh in a Cloud Agent VM:

```bash
export CURSOR_API_KEY=...
export CURSOR_REPO_URL=https://github.com/m2moiz/hack-raise
export CURSOR_STARTING_REF=main

pnpm agents:env:check
pnpm agents:cloud user-dashboard-next
# equivalent: pnpm agents:playwright -- --scenario user-dashboard-next
```

### `cloud-env`

Use a saved named environment for **faster repeat runs** (~2–5 min). Full walkthrough: [cloud-env-setup.md](./cloud-env-setup.md).

1. Create environment in Cursor dashboard (guided setup on `main`)
2. Save snapshot as e.g. `hack-raise-testbed`
3. Set `CURSOR_CLOUD_ENV_NAME=hack-raise-testbed`
4. Unset `CURSOR_REPO_URL` (mutually exclusive)

```bash
export CURSOR_CLOUD_ENV_NAME=hack-raise-testbed
pnpm agents:cloud user-dashboard-next
```

## Smoke check

Before real scenarios, validate VM setup:

```bash
pnpm agents:playwright -- --smoke
```

The smoke agent verifies Node version, git ref, and required `HACK_RAISE_*` env vars, then writes `smoke.txt` under the artifact dir.

## Orchestrator commands

| Command | Purpose |
| --- | --- |
| `pnpm agents:env:check` | Validate Node, profile, API key, model list |
| `pnpm agents:cloud <scenario>` | Launch one scenario (loads `.env`, logs timing to `docs/cloud-timing.log`) |
| `pnpm agents:playwright` | Lower-level launcher (`--scenario`, `--smoke`) |
| `pnpm agents:list` | List recent SDK-created cloud agents |

## Per-run env vars

The orchestrator injects non-secret vars on each `agent.send()`:

- `HACK_RAISE_RUN_ID`
- `HACK_RAISE_SCENARIO_ID`
- `HACK_RAISE_ROLE`
- `HACK_RAISE_ARTIFACT_DIR`

Optional: `HACK_RAISE_TESTPAD_BASE_URL` when the app is managed externally.

## Artifacts

After a cloud run:

1. Agent record JSON → `.hack-raise/agent-runs/<runId>/<agentId>.json`
2. Agent transcript → `.hack-raise/agent-runs/<runId>/<agentId>-transcript.txt`
3. Playwright output → `.hack-raise/runs/<runId>/` (when agent executes runner; includes screenshots, `trace.zip`, manifest)
4. Cloud workspace files → `.hack-raise/cloud-artifacts/<runId>/<agentId>/` via SDK (when available)

The orchestrator calls `agent.listArtifacts()` then `agent.downloadArtifact()` after each run. **Known limitation:** SDK `listArtifacts()` often returns 0 items today — screenshot and manifest paths are still reported in the agent transcript/result text on the VM.

Scenario `failed` in the agent run JSON means seeded bugs were reproduced (Playwright exit 1), not that the Cloud Agent itself failed. Console output shows `Agent: passed. Scenario: failed.` when bugs are found as expected.

## Troubleshooting

| Issue | Action |
| --- | --- |
| `CURSOR_API_KEY` missing | Export locally; never commit |
| Repo not connected | Connect SCM in Cursor dashboard |
| Named env + repo URL | Use one profile only |
| `agent_busy` | Orchestrator creates one agent per scenario |
| Playwright browsers missing | Re-run install from `environment.json` |
| Run appears stuck | Wait 10–15 min; full install + Playwright is slow |
| Testpad won't exit after run | Fixed in `6470455+` (process-group shutdown); ensure VM clones latest `main` |

## Switching profiles without code changes

Set either `CURSOR_REPO_URL` (cloud-repo) or `CURSOR_CLOUD_ENV_NAME` (cloud-env). The orchestrator builds discriminated `CloudOptions` automatically.

## CI

GitHub Actions runs `pnpm build`, `pnpm typecheck`, and `node scripts/verify-e2e-scenario.mjs user-dashboard-next` on push/PR. Cloud agents are not run in CI.
