---
name: E2E Graph Harness
overview: Build a hackathon MVP for an agentic end-to-end testing platform that statically maps a web app, dynamically explores it in isolated browser runs, reconciles the two graphs, and produces visual bug evidence. The demo centers on a deliberately buggy testpad app and a polished graph/card report UI, while using Cursor SDK/Cloud Agents as the prize-aligned orchestration layer.
todos:
  - id: scaffold-monorepo
    content: Create the TypeScript monorepo with dashboard, testpad, runner, graph-core, code-map, report, and cursor-orchestrator packages.
    status: pending
  - id: build-testpad
    content: Build the intentionally buggy sample web app with user/admin flows and deterministic seeded failures.
    status: pending
  - id: static-code-map
    content: Implement the Next.js/React static route and transition graph extractor.
    status: pending
  - id: runtime-explorer
    content: Implement Playwright-based exploration with traces, video, screenshots, HAR, console logs, and runtime graph output.
    status: pending
  - id: graph-diff
    content: Implement graph normalization, reconciliation, finding classification, and confidence scoring.
    status: pending
  - id: report-ui
    content: Build the React Flow graph, card-stack replay, artifact viewer, and bug report UI.
    status: pending
  - id: cursor-integration
    content: Add Cursor SDK/Cloud Agent orchestration for parallel code analysis and suggested fixes.
    status: pending
  - id: demo-hardening
    content: Package the demo run, add fallback fixtures, and rehearse the 3-minute judging script.
    status: pending
---

# E2E Graph Harness Hackathon Plan

> Superseded by [2026-07-04-reordered-e2e-harness.md](./2026-07-04-reordered-e2e-harness.md) for build order. Kept for reference.

## Product Thesis

Build "Cartographer" or "FlowLens": an agentic QA platform that turns any web app into two comparable maps.

- The code map shows routes, links, components, and intended transitions discovered from the repository.
- The runtime map shows screens and transitions actually reachable through browser exploration.
- The diff between them becomes a bug report: broken buttons, unreachable screens, dead routes, console errors, failed network calls, and auth/role flow failures.
- The visual hook is a graph plus a replayable deck of screen cards, where each navigation stacks a new screen card over the previous one.

(See full original plan content in git history or `~/.cursor/plans/e2e_graph_harness_202351db.plan.md`.)
