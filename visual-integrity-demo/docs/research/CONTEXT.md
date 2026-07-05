# Session context (migrated from planning chat)

## Product

**Working names:** Cartographer / FlowLens

Platform that:

1. Maps intended app flow from **code** (routes, links, components)
2. Maps **runtime** flow via browser exploration (Playwright)
3. **Diffs** the graphs → unreachable screens, broken buttons, role bugs, etc.
4. Packages **evidence**: video, trace, console, network, Grafana traces/logs/metrics
5. Visualizes as **graph + card-stack replay** (each screen = card stacked on previous)

## Hackathon

- **Main track:** Cursor (La Maison, Paris)
- **Also required to pick one of five tracks** — we optimize Cursor first
- **Judging:** Demo 50%, Impact 25%, Creativity 15%, Pitch 10%
- **Rules:** public repo, new work only, no dashboard-as-main-feature (our dashboard is QA harness, not generic analytics)
- **Submission:** 1-min demo video + GitHub

## Strategic stack (reordered)

| Layer | Tool | Role |
|-------|------|------|
| Orchestration | Cursor SDK / Cloud Agents | Parallel code analysis, E2E agents, fix PRs |
| Browser proof | Playwright | Exploration, traces, video, HAR |
| System proof | Grafana + OTel + Alloy | Loki logs, Tempo traces, Mimir metrics |
| Reasoning | NVIDIA Nemotron | Summarize evidence bundle, optional VL |
| UI | React Flow + Framer Motion | Graph + card deck |

## Testbed decision

**Both:**

- **apps/testpad** — controlled buggy Next.js app with known failures
- **OpenTelemetry demo** (`open-telemetry/opentelemetry-demo`) — Grafana-native, public known issues (OOM, broken dashboards, metrics temporality)

## Current implementation priority

User asked to build **now**:

1. Testbed app (small buggy app first, OTel demo as advanced target)
2. **Automatic Cursor Cloud Agent spawning** for E2E runs (agent prompts TBD by user later)

## Workspace note

Automated `move_agent_to_root` to this folder timed out twice (~3.5 min). Open this folder manually in Cursor if the workspace root is still elsewhere.

## Source artifacts

- Plans copied from `~/.cursor/plans/`
- Sponsor PDFs copied from `~/Downloads/` (see `docs/sponsors/`)
