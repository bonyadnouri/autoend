# hack-raise — E2E Graph Harness

Agentic end-to-end testing platform for the RAISE Summit Hackathon (Cursor track).

## Team deliverable (implemented)

Spawnable testbed + Cloud Agent workflow. **4/4 cloud Playwright scenarios verified** (all seeded bugs reproduced via `pnpm agents:cloud`).

| Package / app | Purpose |
| --- | --- |
| `apps/testpad` | Deterministic buggy Next.js app (4 seeded bugs) |
| `packages/graph-core` | Shared Zod contracts + fixtures |
| `packages/runner` | Playwright CLI with canonical run manifests + traces |
| `packages/cursor-cloud-sidearm` | Reusable Cursor Cloud Agent orchestration (profiles, safe env injection, lifecycle, artifacts) |
| `packages/cursor-orchestrator` | hack-raise's thin adapter over the sidearm: scenarios, `HACK_RAISE_*` env, prompts, outcome parsing |
| `apps/autoend` | Vendored `@hack-raise/autoend` — agent-powered e2e testing with a committed Flow Map (`pnpm test:autoend`); cloud/sidearm wiring is still design-only |

## Quick start

```bash
pnpm install
pnpm dev:testpad          # http://127.0.0.1:3100
pnpm test:e2e             # all scenarios (exit 1 = bugs reproduced)
pnpm test:e2e -- --scenario user-dashboard-next
pnpm verify:e2e           # CI-style: one scenario + manifest assertion
pnpm agents:env:check     # validate cloud orchestrator config
pnpm agents:cloud user-dashboard-next   # cloud Playwright (~10 min)
```

## Testbed app (share with colleagues)

| Resource | Link |
| --- | --- |
| Live testpad | https://testpad-seven.vercel.app |
| Sharing guide | [docs/testpad-sharing.md](docs/testpad-sharing.md) |
| Contract | https://testpad-seven.vercel.app/__testbed/contract.json |

## Playwright scenarios

| Scenario ID | Seeded bug |
| --- | --- |
| `user-dashboard-next` | `BUG_NEXT_INERT` |
| `user-admin-authz` | `BUG_ADMIN_AUTHZ` |
| `user-task-create` | `BUG_TASK_CREATE_500` |
| `user-broken-link` | `BUG_BROKEN_PROJECT_LINK` |

## Cloud Agents

See [docs/cloud-agents.md](docs/cloud-agents.md) and [AGENTS.md](AGENTS.md). The reusable Cloud
Agent plumbing lives in [`packages/cursor-cloud-sidearm`](packages/cursor-cloud-sidearm); see its
README for how to build on it directly, and
[docs/autoend-cloud-adapter-design.md](docs/autoend-cloud-adapter-design.md) for how a second app
(autoend) is designed to reuse it.

```bash
export CURSOR_API_KEY=...
export CURSOR_REPO_URL=https://github.com/m2moiz/hack-raise
export CURSOR_STARTING_REF=main
pnpm agents:env:check
pnpm agents:cloud user-dashboard-next   # recommended: loads .env, streams progress (~10 min)
# or: pnpm agents:playwright -- --scenario user-dashboard-next
```

## Seeded bugs

- `BUG_NEXT_INERT` — dashboard continue button does nothing
- `BUG_ADMIN_AUTHZ` — normal user reaches `/admin/users`
- `BUG_TASK_CREATE_500` — task API returns 500
- `BUG_BROKEN_PROJECT_LINK` — Beta project link broken

## Artifacts

| Output | Path |
| --- | --- |
| Run manifest + screenshots/traces | `.hack-raise/runs/<runId>/run-manifest.json` |
| Cloud agent records | `.hack-raise/agent-runs/<runId>/<agentId>.json` |
| Downloaded cloud files (when SDK returns them) | `.hack-raise/cloud-artifacts/<runId>/<agentId>/` |

## Docs

| Path | Contents |
| --- | --- |
| [docs/cloud-agents.md](docs/cloud-agents.md) | Cloud Agent setup and profiles |
| [docs/plans/](docs/plans/) | Implementation plans |
| [docs/research/](docs/research/) | Research and architecture notes |
| [AGENTS.md](AGENTS.md) | Cloud Agent run instructions |
