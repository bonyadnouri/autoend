# Cursor SDK as the agent harness

The agents a Run spawns are built on the Cursor SDK (`@cursor/sdk`): autoend rides Cursor's runtime, models, and billing rather than maintaining its own agent loop. Consequence accepted with eyes open: **every autoend user needs a Cursor account** — "available for everyone" narrows to "every Cursor user", and autoend's availability is coupled to a third party's pricing and SDK stability. The Report web app remains viewable without Cursor; only executing Runs requires it.

## Considered Options

- **Harness-agnostic BYO-key loop** (own agent loop on e.g. the Vercel AI SDK, any provider key) — maximum reach, rejected because it means maintaining a full agent harness (tool loops, context management, retries), the wheel these SDKs exist to not reinvent.
- **Claude Agent SDK** — same shape as Cursor SDK with an Anthropic-key footprint; not chosen; team familiarity and ongoing internal research favored Cursor.

## Consequences

- **The SDK does not provide browser automation** (verified July 2026 against `@cursor/sdk`'s shipped typings, not just docs): its built-in tools are createPlan, delete, edit, generateImage, glob, grep, ls, mcp, readLints, read, recordScreen, semSearch, shell, task, updateTodos, write — zero browser/navigate/click tools. The "Browser" tool Cursor users know is an IDE-only pane (a webview driven by an MCP extension) and is not part of the SDK toolset. Browser hands must be supplied by us per ADR-0002, mounted through the SDK's `shell` tool (agent-browser CLI) — `mcp` is the fallback mounting point. The SDK's `recordScreen` (start/save/discard → file path) is not a substitute for Playwright's per-context video, which works headless.

- The hands (agent-browser CLI, ADR-0002) are driven via shell commands, so the harness remains a swappable module: if the Cursor dependency ever becomes untenable, the Flow Map, replay engine, and Report pipeline are unaffected.
- End-user setup requires Cursor authentication before a first Run can work; `npx autoend` must fail early and clearly when it's missing.
- **Runs use LOCAL agents, not Cursor cloud agents.** Evaluated July 2026: cloud agents bill identically (token-based, no VM surcharge) and support shell/MCP tools fine, but cold environment setup is documented at up to ~10 minutes without a pre-baked snapshot — incompatible with the sub-60s Run goal. Cloud becomes interesting only for a future CI mode with pre-warmed environment snapshots.
