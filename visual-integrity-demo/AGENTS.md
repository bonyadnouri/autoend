# Hack Raise — Cloud Agent Instructions

This repo is a deterministic E2E testbed for agentic debugging workflows.

## Setup (idempotent)

On a **saved cloud environment snapshot**, these steps are usually already done. Run only on cold VMs or when deps are missing.

```bash
node scripts/check-node-version.mjs
pnpm install --frozen-lockfile
pnpm --filter @hack-raise/graph-core build
pnpm --filter @hack-raise/runner build
pnpm --filter @hack-raise/runner exec playwright install --with-deps chromium
```

Node **>= 23.6** is required (native TypeScript type-stripping used by `apps/autoend`'s flow scripts needs it). Do **not** use `corepack enable` in cloud VMs (can fail on some runners).

## Cloud scenario (preferred — thin runner)

When `HACK_RAISE_SCENARIO_ID` is set by the orchestrator:

```bash
bash scripts/run-cloud-scenario.sh
```

This runs Playwright only. Do **not** reinstall deps or start `pnpm dev:testpad` separately.

- Exit code **1** = seeded bugs reproduced (expected success)
- Report `run-manifest.json`, bug IDs, screenshot paths, and `trace.zip` paths

## Testpad app

The runner **owns app startup**. Do **not** run `pnpm dev:testpad` separately during scenario execution unless debugging manually.

Manual dev server:

```bash
pnpm dev:testpad
```

Default URL: `http://127.0.0.1:3100`

Contract endpoint: `/__testbed/contract.json`

## Playwright scenarios (local)

Run one scenario:

```bash
pnpm test:e2e -- --scenario user-dashboard-next
```

Run all scenarios:

```bash
pnpm test:e2e
```

### Scenario IDs

- `user-dashboard-next` → reproduces `BUG_NEXT_INERT`
- `user-admin-authz` → reproduces `BUG_ADMIN_AUTHZ`
- `user-task-create` → reproduces `BUG_TASK_CREATE_500`
- `user-broken-link` → reproduces `BUG_BROKEN_PROJECT_LINK`

## Artifacts

Canonical output lives under `HACK_RAISE_ARTIFACT_DIR` (default: `.hack-raise/runs/<runId>/`).

Each scenario writes:

- `run-manifest.json` at the run root
- per-scenario screenshots, `trace.zip`, and `events.jsonl`

## Environment variables (non-secret)

| Variable | Purpose |
| --- | --- |
| `HACK_RAISE_RUN_ID` | Stable run identifier |
| `HACK_RAISE_SCENARIO_ID` | Scenario under test (must match CLI) |
| `HACK_RAISE_ROLE` | Expected role (`user` or `admin`) |
| `HACK_RAISE_TESTPAD_BASE_URL` | External testpad URL (optional) |
| `HACK_RAISE_ARTIFACT_DIR` | Artifact output directory |

Never pass `CURSOR_*` variables through cloud `envVars`. Keep API keys local to the orchestrator.

## Expected failure format

Seeded bugs should produce **failed** scenario runs with findings in `run-manifest.json`:

```json
{
  "findings": [
    {
      "bugId": "BUG_NEXT_INERT",
      "classification": "seeded_bug_reproduced"
    }
  ]
}
```

Report artifact **paths** and bug IDs — not raw cookies, headers, or secrets.

## Cloud profiles

- **cloud-repo**: clone `CURSOR_REPO_URL` at `CURSOR_STARTING_REF` (slower cold start)
- **cloud-env**: use saved environment `CURSOR_CLOUD_ENV_NAME` (faster warm starts via snapshot)

The orchestrator selects the profile automatically. Do not combine named environments with explicit repo clone options.

See [docs/cloud-env-setup.md](docs/cloud-env-setup.md) for snapshot setup.
