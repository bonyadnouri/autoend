# autoend

**Agent-powered end-to-end testing.** Point it at your app, walk away, get back a video-backed report.

```sh
npx autoend init    # guided setup — takes a minute
npx autoend         # agents test your app, a report opens
```

Straight from GitHub also works: `npx github:bonyadnouri/autoend init`

No test suite to write. No selectors to maintain. Agents discover your app's flows, guard them on every run, and hand you the evidence on film.

![autoend report showing a hard failure verdict with tiered findings](docs/assets/report-failure.png)

## How a Run works

1. **Replay** — every flow agents have ever verified is re-executed: headless, parallel, deterministic, with a WebM recording per flow. No LLM in the loop, so it's fast and free.
2. **Explore** — within the effort budget you chose, agents probe new surface: clicking, filling, navigating — looking for flows nobody wrote down and failures nobody noticed.
3. **Report** — a local page opens with a one-glance verdict. Click into any finding and *watch* what the agent saw.

Findings arrive in tiers, so signal never drowns in noise:

| Tier | Meaning | Your move |
|---|---|---|
| **Hard failure** | Objectively broken — 5xx, crashes, console errors | Fix it |
| **Regression** | Worked in a previous run, failed now | Fix it — or dismiss if the removal was intentional |
| **Heal** | UI changed, goal still works; the flow script was rewritten | Watch the video, confirm the heal |
| **Advisory** | Agent judgment: UX, accessibility, speed | Your call |

![autoend report showing the all clear state](docs/assets/report-all-clear.png)

## The Flow Map is yours

Everything agents learn lives in your repo, in plain Playwright:

```
.autoend/
├── flows/                 # commit this — your team's shared baseline
│   └── checkout/
│       ├── flow.json      # metadata: title, last passed, ...
│       └── flow.mts       # an ordinary Playwright script
└── runs/                  # gitignored — reports + evidence videos
```

Flows are ordinary Playwright scripts. Branches carry their own baseline, teammates share it through git, map changes show up in PRs like any other diff — and if you ever leave autoend, you walk away with a working Playwright suite. **No lock-in, by design.**

## Effort: you choose how hard it tests

```sh
npx autoend              # your configured default
npx autoend -e low       # quick pass        (~1-2 min)
npx autoend -e high      # thorough sweep    (~5 min)
npx autoend -e ultra     # leave it running  (~35 min)
```

Replay always completes at any effort — regression coverage is never sacrificed to a small budget. Effort only scales exploration.

## Requirements

- **Node.js ≥ 23.6** (flow scripts run via native TypeScript type-stripping)
- **A Cursor API key** — exploring agents run on the [Cursor SDK](https://cursor.com/docs/sdk/typescript) ([get a key](https://cursor.com/dashboard))
- Browsers install on first use via Playwright; [agent-browser](https://github.com/vercel-labs/agent-browser) ships as a dependency

## Status

Early. The architecture is settled, documented, and de-risked end-to-end; the explorer fleet is the active front.

- [x] Run pipeline: replay → explore → report artifact
- [x] Replay engine — parallel headless Playwright with per-flow video
- [x] Report viewer — verdict, tiers, embedded evidence
- [x] Guided setup (`autoend init`)
- [x] Cursor SDK harness verified (agents driving agent-browser via shell)
- [ ] Explorer fleet — flow discovery, hard-failure detection, advisories
- [ ] Heal-and-notify on replay failures
- [ ] Report resolution actions (dismiss / reject / suppress)
- [ ] Fleet auth — login once, share session storage state

## Under the hood

Every load-bearing decision is written down — start with [`CONTEXT.md`](./CONTEXT.md) (the project glossary) and [`docs/adr/`](./docs/adr/):

1. [Fly-generated tests over an accumulated Flow Map](./docs/adr/0001-fly-generated-tests-over-accumulated-flow-map.md)
2. [agent-browser hands + Playwright artifacts](./docs/adr/0002-agent-browser-hands-playwright-artifact.md) — why exploration and replay use different engines
3. [Cursor SDK as the agent harness](./docs/adr/0003-cursor-sdk-as-agent-harness.md)
4. [Report as a static artifact + thin viewer](./docs/adr/0004-report-as-static-artifact.md)

The short version: exploration is LLM-latency-bound, so agents drive the browser through the most token-efficient hands available (agent-browser, ~200–400 tokens per snapshot). Replay is reliability-bound, so flows persist as plain Playwright with auto-waiting and native video. The report is static files served by a dumb local viewer — portable to CI by construction.

## Development

```sh
npm install
npm test              # vitest — includes a real browser replay integration test
npm run build         # tsc → dist/
npm run dev -- http://localhost:3000 -e low --no-open
```

## License

[MIT](./LICENSE)
