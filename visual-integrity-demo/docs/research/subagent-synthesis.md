# Research synthesis (subagents)

## Execution sandboxes ([sandbox comparison](c9f7a009-4dde-4470-b3aa-260f6503a7bd))

**Recommended hackathon architecture:**

1. **App layer:** Docker (MVP) or Fly Machines (stretch)
2. **Browser layer:** Playwright workers + optional Browserbase/Steel for hosted sessions
3. **Analysis layer:** traces + logs → graph + bug report

**Priority order:**

1. Playwright browser contexts (fastest)
2. Docker Compose per app instance
3. Cursor Cloud Agents (code/triage, not primary browser fleet)
4. Steel / Browserbase for remote CDP sessions
5. Vultr VMs, Firecracker — too heavy for hackathon MVP

## Cursor platform ([Cursor hooks](e4069b6b-605d-4792-8ee8-1d8009d95fef))

- **Cloud Agents API v1** + **`@cursor/sdk`** — spawn agents, stream runs, artifacts, PRs
- One active run per agent; parallelism = **multiple agents**
- Cloud = isolated VM, cloned repo, durable runs
- Use HTTP MCP for harness metadata in cloud agents
- Demo: parallel failure investigators, coverage swarm, release gate dashboard

**SDK patterns:**

- `Agent.prompt()` — one-shot
- `Agent.create()` + `agent.send()` — streaming, multi-turn
- Always set `cloud:` or `local:` explicitly
- Distinguish `CursorAgentError` (never started) vs `result.status === "error"` (ran and failed)

## OSS scaffolding ([OSS survey](8d2607b1-03d7-44e0-a78b-fbdf7d9f35b9))

**Use:**

- Playwright (artifacts, traces, video)
- Stagehand (assisted exploration only)
- ts-morph / nextmap ideas (static routes)
- React Flow (graph UI)

**Don't build:**

- Browser automation from scratch
- Full graph renderer
- General autonomous browser agent
- Arbitrary framework static analysis (start Next.js only)

**Custom value:** graph reconciliation + evidence-backed reporting

## Sponsor / side-track notes

See [sponsors-and-tracks.md](./sponsors-and-tracks.md).
