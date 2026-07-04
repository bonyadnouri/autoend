# agent-browser for exploration hands, Playwright scripts as the Flow artifact

Exploring agents drive the browser through Vercel's agent-browser CLI; every discovered Flow is persisted in the Flow Map as a Playwright script, verified by executing it once at authoring time. Runs replay the map as plain parallel headless Playwright — LLM-free, with video Evidence captured natively.

The split follows the cost structure: exploration is LLM-latency-bound, so the hands must minimize tokens per step (agent-browser snapshots are ~200–400 tokens vs ~13.7k context for Playwright MCP); replay is page-load-bound and reliability-sensitive, so the artifact should auto-wait and parallelize (Playwright), and every flake avoided is an LLM healing call not paid for. Playwright scripts also make the Flow Map ejectable — a user can walk away with a real test suite, no lock-in.

## Considered Options

- **All-Playwright (MCP hands + script artifact)** — simpler single stack, rejected for fleet token cost: exploration context multiplies across dynamically spawned agents on the user's API key.
- **All-Stagehand** — its cached-action replay/self-heal is built in, but the artifact is opaque JSON (no eject path), local video is undocumented (breaks the Evidence requirement off Browserbase cloud), and act()/observe() run their own LLM loop inside the library — a second brain and second bill under a Cursor-SDK harness.
- **All-agent-browser (command transcript as artifact)** — rejected: snapshot refs are per-snapshot, not stable selectors; replaying transcripts against a changed page would force us to rebuild selector stabilization, i.e. reinvent Playwright locators.
- **Playwright CLI (`@playwright/cli`) as hands** — evaluated July 2026 after Microsoft shipped it in the 1.59+ "agentic" line. Agent-facing like agent-browser (snapshot-to-disk with refs, ~68-token schema, built-in video/screencast). Rejected as default hands: third-party benchmarks consistently place it ~4–5x more expensive per run in tokens than agent-browser (which is ~10x cheaper than Playwright MCP), and its video edge is redundant here — exploration Evidence comes from agent-browser's `record` (verified working locally) and replay Evidence from Playwright's `recordVideo`. Revisit if agent-browser stagnates; the hands are a swappable module.

## Consequences

- Two browser stacks ship in the product (agent-browser daemon + Playwright), and authoring includes a refs→locators translation step; the verify-by-running loop is what catches translation errors before a Flow enters the map.
- The hands are a swappable module by design — if a better agent-facing browser CLI appears, the Flow Map and replay engine are unaffected.
- Evidence is engine-produced and headless: agent-browser `record` (WebM) during exploration, Playwright `recordVideo` (WebM) during replays — video is composed from rendered frames, so no display is needed. Two alternatives were considered and rejected: headed browsers (N parallel windows on the user's desktop, slower, flake-prone, no CI path) and Cursor's `recordScreen` tool (screen-level capture: undocumented semantics, needs a display, cannot attribute footage to one of N parallel sessions).
- "Playwright is slow" was evaluated and dismissed for this workload: its per-action overhead (tens of ms) is noise against LLM steps (1–10 s) and page loads (0.5–3 s); the claim originates from high-volume automation use cases (see Browserbase's Stagehand v3 rationale), not suite replay.
