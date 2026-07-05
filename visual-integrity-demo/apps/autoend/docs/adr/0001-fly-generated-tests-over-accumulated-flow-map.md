# Fly-generated tests over an accumulated Flow Map

autoend has no checked-in test suite. A Run spawns agents that generate and execute e2e tests on the fly against the Target; what persists between Runs is the Flow Map — a record of every Flow agents have discovered and successfully executed. Flows enter the map automatically on first successful execution (no human approval): the map is a **baseline of what demonstrably worked**, not a spec of what should work. Each Run replays known Flows deterministically (cheap, comparable run-to-run) and spends its LLM budget exploring new surface.

## Considered Options

- **AI authors deterministic specs, humans own them** (Playwright Agents model) — rejected: overlaps with what Playwright 1.56+ already ships; autoend's value is autonomy, not assisted authoring.
- **Ephemeral runs, nothing persists** — rejected: run N and run N+1 would test different paths, so Reports can't make regression claims and "no findings" means nothing; also re-deriving everything by LLM each Run multiplies token cost.
- **Human-gated Flow Map (seed + discover + approve)** — rejected deliberately in favor of zero-setup onboarding. Known cost: trivial or hallucinated flows can enter the map; mitigated by the oracle (ADR consequences below), not by human review.

## Consequences

- The oracle for Findings must be objective where it matters: Hard Failures (4xx/5xx, crashes, console errors) and Regressions against the map ("worked in a prior Run, fails now") are the trustworthy tiers; Advisory findings (agent UX judgment) are included but must be presented as a separate, lower tier in the Report or they erode trust in the whole Report.
- "Broke" vs "never worked" is only decidable for Flows already in the map — first-Run findings are necessarily weaker claims.
