# Architecture (target)

```mermaid
flowchart LR
  repoInput[Repo_or_App_URL] --> launch[Launch_Testpad_or_Target]
  repoInput --> codeMap[Static_Code_Map]
  launch --> runtimeExplorer[Playwright_Runtime_Explorers]
  launch --> telemetry[OpenTelemetry_Grafana]
  runtimeExplorer --> runtimeMap[Runtime_Flow_Map]
  runtimeExplorer --> browserArtifacts[Trace_Video_Screenshots]
  telemetry --> systemEvidence[Logs_Traces_Metrics]
  codeMap --> reconciler[Graph_Reconciler]
  runtimeMap --> reconciler
  browserArtifacts --> evidenceBundle[Evidence_Bundle]
  systemEvidence --> evidenceBundle
  reconciler --> findings[Bug_Findings]
  evidenceBundle --> nemotron[Nemotron_Reasoner]
  nemotron --> findings
  findings --> reportUI[Graph_Card_Report]
  findings --> cursorAgents[Cursor_Cloud_Agents]
  cursorAgents --> suggestedFixes[Suggested_Fixes_or_PRs]
```

## Monorepo (planned)

```
hack-raise/
├── apps/
│   ├── web/          # harness dashboard + report UI
│   └── testpad/      # intentionally buggy demo app
├── packages/
│   ├── graph-core/
│   ├── code-map/
│   ├── runner/       # Playwright workers
│   ├── observability/
│   ├── reasoning/    # Nemotron / model router
│   ├── cursor-orchestrator/
│   └── report/
└── docs/
```

## Cursor Cloud Agent orchestration (next code)

- API: `POST /runs` → spawn N cloud agents with scenario prompts
- One agent per shard (user flow, admin flow, smoke, etc.)
- Stream status via `@cursor/sdk` `run.stream()`
- User will define agent instructions later; stub with placeholder prompts now

## Data model (sketch)

- `ScreenNode`, `TransitionEdge`, `BugFinding`, `RunArtifact`, `ObservabilityEvidence`, `ReasoningResult`

See [2026-07-04-reordered-e2e-harness.md](../plans/2026-07-04-reordered-e2e-harness.md).
