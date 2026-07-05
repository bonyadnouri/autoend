# autoend

[![npm](https://img.shields.io/npm/v/%40bonyadnouri%2Fautoend?label=npm&color=cb3837)](https://www.npmjs.com/package/@bonyadnouri/autoend)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**End-to-end testing that writes and maintains itself.** Point it at your web app and AI agents click through it like real users — filling forms, following links, moving between pages. They figure out what works, flag what's broken, and hand you a report with a screen recording behind every result.

You never write a test.

```sh
npx @bonyadnouri/autoend init    # one-time guided setup
npx @bonyadnouri/autoend         # agents test your app; results open in the dashboard
```

![autoend results overview](docs/assets/viewer-overview.png)

## Related projects

- **[Lumen](https://github.com/an2323/lumen)** — the web dashboard that shows what the agents found (app map, tests, issues, insights), updating live as a run happens.

## What it does

1. **You give it a URL** — your local dev server, a staging site, or a preview link.
2. **AI agents explore the app** the way a person would, discovering the things that matter ("a visitor can sign up", "a shopper can check out").
3. **Every action that works is saved** as an ordinary [Playwright](https://playwright.dev) script in your repo. Together these scripts form your **flow map**: a growing, runnable record of everything your app can do.
4. **Later runs re-run the whole flow map first** — fast, no AI needed — then spend time exploring only the parts that are new.
5. **You get a report**: a clear pass/fail summary, problems grouped by how serious they are, and a video for each one so you can *watch* what happened instead of reading a stack trace.

The result is real test coverage that grows on its own and catches things that break between runs — without you writing or maintaining a single test.

## Why it's different

- **You never write or maintain tests.** The agents discover them and keep them working.
- **AI only costs money when exploring something new.** Re-running saved tests is free and fast (plain Playwright, no AI).
- **No lock-in.** The saved tests are normal Playwright files in *your* repo. Stop using autoend tomorrow and you still have a working test suite. Teammates share tests through git, and agent-made changes show up in pull requests like any other diff.

## Requirements

- **Node.js 23.6 or newer**
- **A Cursor account and API key** — the agents run on [Cursor](https://cursor.com/docs/sdk/typescript), and usage bills to your Cursor plan. Get a key at [cursor.com → Dashboard → API Keys](https://cursor.com/dashboard).
- Works on macOS, Linux, and Windows

## Install and set up

```sh
# guided setup (also installable globally with: npm i -g @bonyadnouri/autoend)
npx @bonyadnouri/autoend init

# one-time: download the browser used to re-run tests
npx playwright install chromium
```

`init` asks a few questions and saves your answers:

```
◆ Where does your app run?                 http://localhost:3000
◆ How thorough should a run be by default? mid — everyday runs · ~2-3 min
◆ Cursor API key                           ✓ saved to .env
◆ Supabase URL (Enter to skip)             https://your-project.supabase.co
◆ Supabase key                             ✓ saved to .env
```

It writes your settings to `.autoend/config.json` and your secrets to a gitignored `.env`. The Supabase details are optional — press Enter to skip them and keep runs local (see [Connecting the dashboard](#connecting-the-dashboard)).

## Run

```
$ npx @bonyadnouri/autoend

Run starting http://localhost:3000 · effort mid
Run finished in 94.1s · 12 replayed · 2 discovered · all clear
```

Your **first run** starts from nothing, so the agents spend the whole time exploring and building the first tests. **Every run after that** re-runs everything it already knows first, so problems that broke since last time show up right away.

## How thorough should a run be?

The `effort` level controls how long the *exploring* phase lasts. Re-running your saved tests always happens in full, so choosing a lower level never reduces your regression coverage.

```sh
npx @bonyadnouri/autoend -e low     # quick check                ~1-2 min
npx @bonyadnouri/autoend -e mid     # everyday runs (default)    ~2-3 min
npx @bonyadnouri/autoend -e high    # deeper analysis            ~15 min
npx @bonyadnouri/autoend -e xhigh   # deeper, two passes         ~25 min
npx @bonyadnouri/autoend -e ultra   # full, thorough bug hunt    ~45-60 min
```

From `high` and up, runs get smarter: the agents read your codebase for context, test as different kinds of users (a first-timer, a power user, someone trying to break things), and double-check a suspected bug by reproducing it on video before reporting it.

## The report

Results appear in the [Lumen dashboard](https://github.com/an2323/lumen). Findings are grouped by how much they should worry you:

| Type | What it means | What to do |
|---|---|---|
| **Hard failure** | Clearly broken — server errors, crashes, console errors | Fix it |
| **Defect** | A real bug the tool reproduced on video (deeper runs only) | Fix it |
| **Regression** | Worked in an earlier run, broken now | Fix it, or remove the test if the change was intended |
| **Advisory** | A suggestion about UX, accessibility, or speed | Your call |

Every finding comes with a video — watch it before digging into logs.

![all-clear report](docs/assets/viewer-all-clear.png)

## The dashboard and live runs

autoend saves its results to a [Supabase](https://supabase.com) database that the Lumen dashboard reads. There are two ways to run:

- **One-off from the terminal** — results are saved when the run finishes.
- **As a background service** — run `autoend serve` and start runs from the Lumen web UI instead. You'll watch results appear **live**: screens and connections show up on the map as the agents navigate, and each test flips to pass or fail the moment it settles.

```sh
autoend serve
```

![the Lumen dashboard during a live run](docs/assets/lumen-appmap.png)

### Connecting the dashboard

Set these in `.env` (or let `init` do it for you):

```sh
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

Set up the Lumen database first — see the [Lumen README](https://github.com/an2323/lumen).

Each app you test is tracked by its **URL**: run the same URL again and it replaces that project's results; use a different URL and it's kept as a separate project you can switch between in the dashboard.

If you leave Supabase unset, runs still work and save results locally — they just don't publish to the dashboard.

> **Heads up:** the recorded videos and screenshots are stored publicly and viewable by anyone with the link. Only test apps where that's acceptable — local, or staging with fake data — never production with real user data.

## Commands

```
autoend init            guided setup
autoend [url]           run against a URL (or your saved default)
autoend serve           run as a background service for the dashboard
autoend clean           delete local run files

  -e, --effort <level>  low | mid | high | xhigh | ultra
      --model <id>      which Cursor model to use (default: the strongest available)
```

## Safety

The agents really use your app — they click buttons and submit forms. Two guardrails are built in: they stay on your app's own domain, and they avoid destructive actions. The third is up to you: **point autoend at a safe environment** (local, or staging with test data), never production.

The saved tests are written by AI and run inside autoend's own process, so autoend blocks any generated script that tries to reach the system (environment variables, child processes, `eval`, and so on) and hides your secrets while scripts run. This is a safeguard, not a full sandbox.

## Your tests belong to you

```
.autoend/
├── flows/                 # your saved tests — commit these
│   └── choose-pro-plan/
│       ├── flow.json      # info: name, when it was found, last time it passed
│       └── flow.mts       # a normal Playwright script
└── runs/                  # local reports and videos (not committed)
```

A saved test is as readable as this:

```ts
// .autoend/flows/choose-pro-plan/flow.mts
export default async function flow(page, target) {
  await page.goto(new URL('/pricing', target).href);
  await page.getByRole('button', { name: 'Choose Pro' }).click();
  const status = await page.textContent('#plan');
  if (status !== 'Pro plan selected') throw new Error('expected confirmation, got ' + status);
}
```

To retire a test for a feature you removed on purpose, delete its folder.

## Development

```sh
npm install
npm test              # runs the test suite (includes a real browser test)
npm run build         # compile to dist/
npm run dev -- http://localhost:3000 -e low   # run from source
npm run serve         # run the dashboard background service from source
```

Design decisions are documented in [`CONTEXT.md`](./CONTEXT.md) and [`docs/adr/`](./docs/adr/) if you want the deeper reasoning.

## License

[MIT](./LICENSE)
