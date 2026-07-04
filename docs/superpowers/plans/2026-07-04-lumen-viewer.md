# Lumen Viewer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated-HTML dossier viewer with a vendored, trimmed, glossary-renamed copy of the lumen React prototype, wired to a grown `RunArtifact` schema (flows snapshot, per-finding console/network/timeline/screenshots, Diagnosis, environment) and to working Dismiss/Suppress resolution actions.

**Architecture:** The viewer is a Vite + React + Tailwind SPA living in `viewer/`, built into `dist/viewer/` at publish time, served as static assets by the existing thin Node server (ADR-0004: server stays dumb — file reads and file edits only). The replay engine grows Playwright-side capture (console, network, navigation timeline, screenshots). Diagnosis is schema-only in this plan (ADR-0006's producers are blocked on in-flight agent-harness research); the fixture demonstrates rendering.

**Tech Stack:** TypeScript, Node >= 23.6, vitest, Playwright, React 18, react-router-dom 6 (hash router), Tailwind CSS 3, lucide-react, Vite 5.

**Lumen source:** clone at `/private/tmp/claude-501/-Users-bonyadnouri-Projects-autoend/98ad1bf9-3ae9-4ee7-aa82-01740dd192f2/scratchpad/lumen`. If missing: `git clone --depth 1 https://github.com/an2323/lumen <that path>`.

## Global Constraints

- CONTEXT.md glossary terms are law in ALL user-visible strings and identifiers: Flow (never journey/test/scenario), Finding (never issue/bug), the three Finding kinds are `hard-failure` ("Hard Failure"), `regression` ("Regression"), `advisory` ("Advisory"); Heal, Diagnosis, Evidence, Run, Target, Effort, Dismiss/Reject/Suppress. Grep gate: `grep -riE 'journey|test case|scenario|issue|insight' viewer/src` must return zero user-visible hits after Task 3 (identifiers AND rendered copy).
- ADR-0004: the viewer server does file reads and plain file edits only — no LLM access, no agent execution, no database.
- ADR-0005: no `@xyflow/react`; cut screens stay cut (no StartAnalysis, LiveExploration, Exploration, AppMap, ScreenDetails, Insights, role switcher, Jira export).
- The built viewer must also work served statically with `report.json` alongside it (CI mode): hash-based routing, `fetch('api/report')` falling back to `fetch('report.json')` — all fetch paths RELATIVE (no leading `/`).
- Existing tests must keep passing at every task boundary: `npm test` (vitest), `npm run typecheck`.
- `npm pack --dry-run` tarball stays under 600 kB after Task 4.
- New `RunArtifact` fields are additive; `Finding` extensions are all optional (old report.json files still parse).
- Match existing code style: 2-space indent, JSDoc referencing CONTEXT.md/ADRs where a concept originates, no default exports in `src/` (viewer React components may follow lumen's named-export style).

---

### Task 1: Grow the RunArtifact schema and replay-side capture

**Files:**
- Modify: `src/report/types.ts`
- Modify: `src/replay/replay.ts`
- Modify: `src/run/run.ts`
- Modify: `src/explore/explorer.ts` (return discovered-flow snapshots)
- Test: `test/replay.test.ts` (extend), `test/scaffold.test.ts` (extend artifact shape assertions if present)

**Interfaces:**
- Consumes: existing `FlowMeta` (`src/map/flow-map.ts`), `RunArtifact`/`Finding`/`Heal` (`src/report/types.ts`).
- Produces (later tasks rely on these EXACT names):

```ts
// src/report/types.ts — additions (keep every existing export)
export type FaultDomain = 'app' | 'flow' | 'environment';

/** CONTEXT.md: Diagnosis — the filing agent's judgment. Producers land per ADR-0006; schema-only for now. */
export interface Diagnosis {
  rootCause: string;
  faultDomain: FaultDomain;
  /** 0–100. */
  confidence: number;
}

export interface ConsoleEntry {
  level: 'error' | 'warning';
  text: string;
  /** Milliseconds since the Flow's execution started. */
  tMs: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  /** HTTP status; 0 = request failed/aborted before a response. */
  status: number;
  tMs: number;
}

export interface StepResult {
  /** Navigation milestone or terminal outcome, e.g. "goto /pricing". */
  label: string;
  status: 'passed' | 'failed';
  tMs: number;
}

export interface Screenshot {
  /** Filename within the artifact's evidence/ dir. */
  file: string;
  label: 'before' | 'after' | 'at-failure';
  tMs: number;
}

export type Resolution = 'dismissed' | 'rejected' | 'suppressed';

export interface Finding {
  id: string;
  kind: FindingKind;
  flowId?: string;
  title: string;
  detail: string;
  evidence?: string;
  diagnosis?: Diagnosis;
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  timeline?: StepResult[];
  screenshots?: Screenshot[];
  /** Written by the viewer server when the user resolves the Finding. */
  resolution?: Resolution;
}

/** One Flow as this Run touched it — the Report's receipts (CONTEXT.md: Report). */
export interface FlowSnapshot {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'discovered';
  discoveredAt: string;
  lastPassedAt?: string;
  timeline?: StepResult[];
  evidence?: string;
  durationMs?: number;
}

export interface Environment {
  browser: string;
  viewport: string;
  os: string;
  node: string;
  autoendVersion: string;
}

export interface RunArtifact {
  runId: string;
  target: string;
  effort: Effort;
  startedAt: string;
  finishedAt?: string;
  flowsReplayed: number;
  flowsDiscovered: number;
  flows: FlowSnapshot[];
  environment: Environment;
  findings: Finding[];
  heals: Heal[];
}
```

- [ ] **Step 1: Write failing tests for capture**

Extend `test/replay.test.ts` (it already runs flow scripts against a local `node:http` fixture server — follow its existing setup pattern). New tests:

```ts
// Fixture page for capture tests — serve from the test's http server:
// GET /capture  -> 200 html: <script>console.error('boom')</script><img src="/missing.png">
// GET /missing.png -> 404

it('captures console errors, failed network, timeline, and screenshots', async () => {
  // flow script content (write to a temp .mts like existing tests do):
  // export default async function flow(page, target) {
  //   await page.goto(new URL('/capture', target).href);
  // }
  const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, 'cap');
  expect(outcome.ok).toBe(true);
  expect(outcome.console.some((c) => c.level === 'error' && c.text.includes('boom'))).toBe(true);
  expect(outcome.network.some((n) => n.status === 404 && n.url.endsWith('/missing.png'))).toBe(true);
  expect(outcome.timeline[0]).toMatchObject({ label: 'goto /capture', status: 'passed' });
  expect(outcome.screenshots.map((s) => s.label)).toEqual(['before', 'after']);
  for (const s of outcome.screenshots) {
    await expect(access(join(evidenceDir, s.file))).resolves.toBeUndefined();
  }
});

it('labels the terminal screenshot at-failure and the terminal step failed on a throwing flow', async () => {
  // flow script: goto /capture then `throw new Error('nope')`
  const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, 'fail');
  expect(outcome.ok).toBe(false);
  expect(outcome.screenshots.at(-1)?.label).toBe('at-failure');
  expect(outcome.timeline.at(-1)).toMatchObject({ status: 'failed' });
});

it('replayFlowMap returns FlowSnapshots and attaches capture to Regression findings', async () => {
  // one passing flow + one failing flow in a temp map (existing test helpers)
  const result = await replayFlowMap(repoRoot, target, flows, evidenceDir);
  expect(result.flows).toHaveLength(2);
  expect(result.flows.find((f) => f.status === 'failed')).toBeDefined();
  const regression = result.findings[0];
  expect(regression.screenshots?.at(-1)?.label).toBe('at-failure');
  expect(regression.timeline?.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests, verify the new ones fail** — `npm test`. Expected: new tests fail (`console` not a property of `ScriptOutcome`), existing tests pass.

- [ ] **Step 3: Implement types** — apply the `src/report/types.ts` additions from Interfaces above verbatim.

- [ ] **Step 4: Implement capture in `runFlowScript`**

```ts
// replay.ts — extend ScriptOutcome:
export interface ScriptOutcome {
  ok: boolean;
  error?: string;
  evidence?: string;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  timeline: StepResult[];
  screenshots: Screenshot[];
  durationMs: number;
}

const VIEWPORT = { width: 1280, height: 720 };
const CAPTURE_CAP = 50; // per stream; drop beyond, note nothing — caps keep report.json bounded

// inside runFlowScript, after newContext({ recordVideo..., viewport: VIEWPORT }):
const startedMs = Date.now();
const consoleEntries: ConsoleEntry[] = [];
const network: NetworkEntry[] = [];
const timeline: StepResult[] = [];
page.on('console', (msg) => {
  const level = msg.type() === 'error' ? 'error' : msg.type() === 'warning' ? 'warning' : undefined;
  if (level && consoleEntries.length < CAPTURE_CAP)
    consoleEntries.push({ level, text: msg.text(), tMs: Date.now() - startedMs });
});
page.on('pageerror', (err) => {
  if (consoleEntries.length < CAPTURE_CAP)
    consoleEntries.push({ level: 'error', text: String(err), tMs: Date.now() - startedMs });
});
page.on('response', (res) => {
  if (res.status() >= 400 && network.length < CAPTURE_CAP)
    network.push({ method: res.request().method(), url: res.url(), status: res.status(), tMs: Date.now() - startedMs });
});
page.on('requestfailed', (req) => {
  if (network.length < CAPTURE_CAP)
    network.push({ method: req.method(), url: req.url(), status: 0, tMs: Date.now() - startedMs });
});
page.on('framenavigated', (frame) => {
  if (frame !== page.mainFrame() || timeline.length >= CAPTURE_CAP) return;
  const path = new URL(frame.url()).pathname;
  timeline.push({ label: `goto ${path}`, status: 'passed', tMs: Date.now() - startedMs });
});
```

Screenshots: after the first main-frame `load` event write `<videoBase>-before.png` (label `before`); after the script settles (in the existing try/catch, before `context.close()`) write `<videoBase>-after.png` labeled `after` on success or `<videoBase>-at-failure.png` labeled `at-failure` on failure. Wrap each `page.screenshot({ path })` in try/catch (a crashed page must not mask the Flow's own error). On failure also push `{ label: error message truncated to 80 chars, status: 'failed', tMs }` to `timeline`. Populate `durationMs: Date.now() - startedMs`. Filter the `framenavigated` about:blank initial entry (skip when `frame.url() === 'about:blank'`).

- [ ] **Step 5: Extend `replayFlowMap` and `explore`**

`ReplayResult` gains `flows: FlowSnapshot[]` and `browserVersion?: string` (`browser.version()` when launched). Build one `FlowSnapshot` per replayed flow: `status: outcome.ok ? 'passed' : 'failed'`, `timeline/evidence/durationMs` from the outcome, `lastPassedAt` updated on pass (existing logic). Attach `console/network/timeline/screenshots` from the outcome to each Regression `Finding`. `ExplorationResult` (explorer.ts) gains `flows: FlowSnapshot[]`: for each verified `addFlow`, push `{ id, title, status: 'discovered', discoveredAt: now, lastPassedAt: now, evidence, timeline, durationMs }` from its verification outcome. Empty-map early return: `{ replayed: 0, findings: [], heals: [], flows: [] }`.

- [ ] **Step 6: Assemble in `executeRun`**

```ts
// run.ts — environment (os import: node:os):
const pkg = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };
const environment: Environment = {
  browser: replay.browserVersion ? `Chromium ${replay.browserVersion}` : 'Chromium (not launched)',
  viewport: '1280×720',
  os: `${process.platform} ${release()}`,
  node: process.version,
  autoendVersion: pkg.version,
};
// artifact gains: flows: [...replay.flows, ...exploration.flows], environment
```

- [ ] **Step 7: Run all tests and typecheck** — `npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: grow RunArtifact — flows snapshot, capture streams, Diagnosis schema, environment (ADR-0005/0006)"`

---

### Task 2: Vendor and prune lumen into viewer/

**Files:**
- Create: `viewer/` (vendored from the lumen clone: `index.html`, `src/`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `public/logo.svg`)
- Create: `viewer/vite.config.ts`
- Modify: root `package.json` (devDependencies + scripts), root `.gitignore` (add `dist/`  if absent)
- Delete within vendored copy: see Step 2 list

**Interfaces:**
- Produces: `npm run build:viewer` emitting `dist/viewer/index.html` + `dist/viewer/assets/*`; routes (hash-based) `#/`, `#/flows`, `#/flows/:id`, `#/findings`, `#/findings/:id` (still mock-fed until Task 3).

- [ ] **Step 1: Copy lumen in**

```bash
LUMEN=/private/tmp/claude-501/-Users-bonyadnouri-Projects-autoend/98ad1bf9-3ae9-4ee7-aa82-01740dd192f2/scratchpad/lumen
mkdir -p viewer
cp -R "$LUMEN/src" "$LUMEN/index.html" "$LUMEN/tailwind.config.js" "$LUMEN/postcss.config.js" "$LUMEN/tsconfig.json" "$LUMEN/public" viewer/
```

Do NOT copy lumen's `package.json`, lockfile, `vite.config.*`, `tsconfig.node.json`, `*.tsbuildinfo`, `README.md`.

- [ ] **Step 2: Prune cut surface (ADR-0005)**

Delete: `viewer/src/pages/{StartAnalysis,LiveExploration,Exploration,AppMap,ScreenDetails,Insights,TestScenarios}.tsx`, `viewer/src/context/RoleContext.tsx`, `viewer/src/components/{ScreenNode,SeverityBadge}.tsx`, `viewer/src/components/launch/` (whole dir). Rewrite `viewer/src/main.tsx`: drop `@xyflow/react/dist/style.css` import and `RoleProvider`; use `createHashRouter`; keep only routes `/` (Dashboard), `/journeys`, `/journeys/:id`, `/tests/:id`, `/issues/:id`, `*` (NotFound) — Task 3 renames them. Fix all now-dangling imports/usages in surviving files (Sidebar links to cut routes, TopBar role switcher, Dashboard/IssueDetails references to screens/insights, `helpers.ts` lookups into cut concepts): delete the referencing JSX/exports, keeping surviving pages compiling against `mockData.ts`. Keep `TestDetails.tsx` and the whole `investigation/` dir — they become FindingDetails in Task 3.

- [ ] **Step 3: Root package wiring**

Add to root `package.json` devDependencies (exact versions): `"react": "^18.3.1"`, `"react-dom": "^18.3.1"`, `"react-router-dom": "^6.28.0"`, `"lucide-react": "^0.454.0"`, `"@types/react": "^18.3.12"`, `"@types/react-dom": "^18.3.1"`, `"@vitejs/plugin-react": "^4.3.3"`, `"vite": "^5.4.11"`, `"tailwindcss": "^3.4.15"`, `"postcss": "^8.4.49"`, `"autoprefixer": "^10.4.20"`. Scripts: `"build:viewer": "vite build --config viewer/vite.config.ts"`, `"dev:viewer": "vite --config viewer/vite.config.ts"`; `"build"` and `"prepare"` become `"tsc -p tsconfig.json && npm run build:viewer"`. Run `npm install`.

- [ ] **Step 4: Vite config**

```ts
// viewer/vite.config.ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/** Dev-only: serve the fixture Report the way the thin server / static hosting would. */
function fixtureReport(): Plugin {
  const fixtures = join(__dirname, 'fixtures');
  const mime: Record<string, string> = { '.json': 'application/json', '.webm': 'video/webm', '.png': 'image/png' };
  return {
    name: 'autoend-fixture-report',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const file =
          url === '/api/report' || url === '/report.json'
            ? join(fixtures, 'report.json')
            : url === '/api/capabilities'
              ? null
              : url.startsWith('/evidence/')
                ? join(fixtures, 'evidence', url.slice('/evidence/'.length))
                : undefined;
        if (url === '/api/capabilities') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ resolutionActions: true }));
          return;
        }
        if (!file) return next();
        try {
          const body = await readFile(file);
          res.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), fixtureReport()],
  build: { outDir: '../dist/viewer', emptyOutDir: true },
});
```

(`viewer/fixtures/` arrives in Task 3; the plugin 404s until then, which is fine.)

Ensure `viewer/tsconfig.json` is self-contained (no `references`/`extends` pointing at deleted lumen files); vite build must not require a separate `tsc -b`. Type-gate the viewer inside the build script: `"build:viewer": "tsc -p viewer/tsconfig.json --noEmit && vite build --config viewer/vite.config.ts"`. Root `tsconfig.json` must exclude `viewer/` (add to `exclude` if needed).

- [ ] **Step 5: Verify** — `npm run build:viewer` succeeds producing `dist/viewer/index.html`; `grep -r "xyflow\|RoleProvider\|/start\|/exploring" viewer/src` → no hits; `npm test && npm run typecheck` still green (viewer untouched by root tsc).
- [ ] **Step 6: Commit** — `git commit -m "feat: vendor lumen viewer, prune cut surface (ADR-0005)"`

---

### Task 3: Glossary rename, retype to RunArtifact, fixture

**Files:**
- Rename: `viewer/src/pages/Journeys.tsx→Flows.tsx`, `JourneyDetails.tsx→FlowDetails.tsx`, `TestDetails.tsx→FindingDetails.tsx` (absorb `IssueDetails.tsx` — delete it), `Dashboard.tsx→Overview.tsx`
- Create: `viewer/src/data/report.ts` (loader + context), `viewer/src/types.ts` (re-export of report schema), `viewer/fixtures/report.json`, `viewer/fixtures/evidence/` (placeholder assets)
- Delete: `viewer/src/data/mockData.ts`, `viewer/src/data/investigations.ts`, `viewer/src/types/index.ts`, mock-lookup parts of `viewer/src/data/helpers.ts`
- Modify: `viewer/src/main.tsx` (routes), `Sidebar.tsx`, `TopBar.tsx`, `StatusBadge.tsx`, all surviving pages/components

**Interfaces:**
- Consumes: Task 1 schema. The viewer types MUST NOT drift from `src/report/types.ts`: `viewer/src/types.ts` contains a byte-for-byte copy of the exported interfaces (with a header comment `// Mirror of src/report/types.ts — keep in sync; the root file is authoritative.`) because the viewer tsconfig is sandboxed from `src/`. Copy `Effort` inline as `type Effort = 'low' | 'mid' | 'high' | 'xhigh' | 'ultra'`.
- Produces:

```ts
// viewer/src/data/report.ts
export interface Capabilities { resolutionActions: boolean }
export interface ReportData { artifact: RunArtifact; capabilities: Capabilities }
export async function loadReport(): Promise<ReportData>; // fetch 'api/report' -> fallback 'report.json'; capabilities via 'api/capabilities' -> fallback {resolutionActions:false}
export function ReportProvider(props: { data: ReportData; children: ReactNode }): JSX.Element;
export function useReport(): ReportData;      // throws outside provider
export function evidenceUrl(file: string): string; // -> `evidence/${file}` (relative)
```

Route map (hash router): `#/` Overview · `#/flows` Flows · `#/flows/:id` FlowDetails · `#/findings` (Findings list — rebuild from the pruned TestScenarios table pattern inside a new `viewer/src/pages/Findings.tsx`, columns: kind badge, title, Flow link, Evidence dot, Diagnosis confidence when present, resolution strikethrough) · `#/findings/:id` FindingDetails · `*` NotFound. `main.tsx` boots async: `loadReport().then(data => root.render(<ReportProvider data={data}><RouterProvider .../></ReportProvider>))` with a minimal error screen on load failure (plain `<div>` with the message — no spinner theater).

- [ ] **Step 1: Write the fixture** — `viewer/fixtures/report.json`, a `RunArtifact` exercising every surface: 4 flows (2 passed with timelines, 1 failed, 1 discovered), findings: one `hard-failure` (console+network+timeline+screenshots+diagnosis `{rootCause:"/api/cart returns 500 when the promo field is empty", faultDomain:"app", confidence:88}`), one `regression` (flowId, evidence, timeline, screenshots, no diagnosis — meter must not render), one `advisory` (no evidence — prose only), one `advisory` with `resolution:"suppressed"`; one heal `{flowId, summary, evidence}`; full `environment`. Evidence files: generate tiny real assets into `viewer/fixtures/evidence/` (a 1-second WebM via Playwright or checked-in ~10 kB placeholder, three PNGs via `page.screenshot` at 320×180 — a script in the step is fine, committed binaries are fine).
- [ ] **Step 2: Retype and rename** — do the renames; delete mock data files; rewrite `helpers.ts` keeping only pure formatters (`formatDateTime`, `formatClock`, add `KIND_LABEL: Record<FindingKind,string> = { 'hard-failure': 'Hard Failure', regression: 'Regression', advisory: 'Advisory' }` and `KIND_TONE` mapping kinds to the existing status color classes: hard-failure→fail, regression→warn, advisory→ai). `StatusBadge` keys on `FlowSnapshot['status']` | `FindingKind`. All pages read via `useReport()`. Overview = verdict banner (all clear when zero hard-failures+regressions — mirror `src/cli.ts:110-113` logic), tier stat strip (MetricCard per kind + heals), run meta row (target, effort, started, duration, environment summary), top Findings list. Sidebar: Overview / Flows / Findings + Run id footer; TopBar: target + effort + verdict chip (role switcher already gone).
- [ ] **Step 3: FindingDetails v1** — header (kind badge, title, flow link, detail prose), Evidence `<video controls>` when `evidence` present (use `evidenceUrl()`), diagnosis card when present (reuse `FailureAnalysisCard` + `ConfidenceMeter` — pass `diagnosis.rootCause/faultDomain/confidence`), and the raw investigation panels stubbed OFF for now (Task 5 wires them — leave the imports out, not commented out). `FlowDetails`: status, timeline list, evidence video, lastPassedAt/discoveredAt, linked findings.
- [ ] **Step 4: Verify** — `npm run dev:viewer`, load `http://localhost:5173/#/`: Overview renders fixture, all routes navigable, no console errors; `npm run build:viewer` green; glossary grep gate from Global Constraints returns zero user-visible hits; `serve dist/viewer` + copying fixture `report.json`+`evidence/` beside `index.html` renders read-only (capabilities fallback hides nothing yet — buttons come in Task 5).
- [ ] **Step 5: Commit** — `git commit -m "feat: viewer speaks the glossary and reads real Run artifacts"`

---

### Task 4: Thin server serves the viewer; resolution actions become file edits

**Files:**
- Modify: `src/viewer/server.ts` (static assets, capabilities, dismiss/suppress/reject), `src/cli.ts:122` (pass repoRoot), `src/run/run.ts` (filter suppressed advisories), `src/map/flow-map.ts` (add `removeFlow`), `src/report/artifact.ts` (add `updateFinding`)
- Delete: `src/viewer/html.ts`
- Test: `test/viewer.test.ts` (new)

**Interfaces:**
- Consumes: `dist/viewer/` from Task 2, `Resolution`/`Finding` from Task 1.
- Produces (Task 5 relies on these exactly):
  - `GET /` and `GET /assets/*` → `dist/viewer` files (resolve via `new URL('../../dist/viewer/', import.meta.url)`; content-types: `.html` text/html, `.js` text/javascript, `.css` text/css, `.svg` image/svg+xml, `.png` image/png; reject any normalized path escaping the dir)
  - `GET /api/report`, `GET /evidence/<file>` (unchanged; evidence also serves `.png` now — content-type by extension)
  - `GET /api/capabilities` → `{"resolutionActions":<boolean>}` — true iff `serveReport` received a `repoRoot`
  - `POST /api/findings/:id/dismiss` → only valid for `kind:'regression'` with a `flowId`: `removeFlow(repoRoot, flowId)` (recursive dir delete under `.autoend/flows/`), then `updateFinding(artifactDir, id, { resolution: 'dismissed' })`; 200 `{"ok":true}` · 404 unknown id · 409 wrong kind · 501 no repoRoot
  - `POST /api/findings/:id/suppress` → only `kind:'advisory'`: append the finding's `title` to `.autoend/suppressed.json` (shape `{"advisories": string[]}`, created on first use, dedupe), then `updateFinding(..., { resolution: 'suppressed' })`; same status codes
  - `POST /api/findings/:id/reject` → 501 `{"error":"Reject requires Heals, which are not produced yet (ADR-0006 follow-up)"}`
  - `serveReport(artifactDir: string, port = 0, repoRoot?: string)` — new optional third param
  - `executeRun` reads `.autoend/suppressed.json` and drops advisory findings whose title is listed, BEFORE writing report.json (Suppress semantics, CONTEXT.md: "future Runs stop re-reporting")

- [ ] **Step 1: Write failing tests** — `test/viewer.test.ts`: temp artifact dir with a minimal report.json (one regression w/ flowId, one advisory) + temp repoRoot with a matching `.autoend/flows/<id>/` dir. Assert: `GET /` returns 200 html (build `dist/viewer` in a `beforeAll` via `execSync('npm run build:viewer')` ONLY if `dist/viewer/index.html` missing — keep the suite fast); capabilities true with repoRoot / false without; dismiss deletes the flow dir and rewrites report.json with `resolution:"dismissed"`; dismiss on the advisory → 409; suppress appends the title to suppressed.json and is idempotent; reject → 501; path traversal `GET /assets/../../package.json` → 400/404. Then a unit test in the same file: `executeRun`-level suppression is covered by a direct test of the new `filterSuppressed(findings, suppressed)` helper (export it from run.ts).
- [ ] **Step 2: Run tests, verify failures** — `npm test`. New file fails; others green.
- [ ] **Step 3: Implement** — `removeFlow(repoRoot, id)` = `rm(join(flowMapDir(repoRoot), id), { recursive: true, force: true })`; `updateFinding(artifactDir, findingId, patch)` = read report.json, map findings, write back pretty-printed; server rewrite per the contract (keep the existing dumb-server JSDoc, update the TODO comment away); `html.ts` deleted; fix `scaffold.test.ts` if it imports `VIEWER_HTML`; cli passes `repoRoot` as third arg.
- [ ] **Step 4: Verify** — `npm test && npm run typecheck && npm run build`; `npm pack --dry-run 2>&1 | tail -5` shows `dist/viewer/**` included and total < 600 kB. Manual smoke: `node dist/cli.js https://example.com --effort low` (no CURSOR_API_KEY needed — exploration skips) then open the printed Report URL: lumen viewer renders the real (likely empty-map) artifact.
- [ ] **Step 5: Commit** — `git commit -m "feat: thin server serves lumen viewer; Dismiss/Suppress are file edits (ADR-0004)"`

---

### Task 5: Full investigation suite, export, resolution UI, visual QA

**Files:**
- Modify: `viewer/src/pages/FindingDetails.tsx`, `viewer/src/pages/FlowDetails.tsx`, `viewer/src/components/investigation/{InvestigationView,ReplayPlayer,ExecutionTimeline,LogPanel,NetworkInspector,EvidencePackage,EnvironmentDetails,FailureAnalysisCard,ExportMenu}.tsx`
- Delete: `viewer/src/components/investigation/{ExpectedVsActual,ConfidenceMeter-if-unused-standalone}.tsx` (keep `ConfidenceMeter` — `FailureAnalysisCard` uses it; delete only `ExpectedVsActual`)
- Create: `viewer/src/components/ResolutionActions.tsx`

**Interfaces:**
- Consumes: Task 1 schema via `useReport()`, Task 4 endpoints, `evidenceUrl()`.
- Produces: user-facing behavior only (no downstream tasks).

- [ ] **Step 1: ReplayPlayer → real video** — replace the mock frame player with `<video controls preload="metadata" src={evidenceUrl(evidence)}>` behind a `ref`; export `seekTo(ms: number)` via `useImperativeHandle` (sets `currentTime = ms/1000` and plays). Timeline entries and `EvidencePackage` screenshots call it. `EvidencePackage`: real `<img src={evidenceUrl(shot.file)}>` (drop `ScreenshotPlaceholder` + `getScreen` — delete `ScreenshotPlaceholder.tsx` when unreferenced), labels map `before→"Before"`, `after→"After"`, `at-failure→"At failure"`.
- [ ] **Step 2: Panels on real streams** — `ExecutionTimeline` renders `StepResult[]` (label, status icon, `formatClock(tMs)`, click seeks video); `LogPanel` renders `ConsoleEntry[]` with level styling; `NetworkInspector` renders `NetworkEntry[]` (status 0 shown as "failed"); `EnvironmentDetails` rows: Browser, Viewport, OS, Node, autoend version, Started (drop Device/Orientation/Theme/Network rows and their icons); `FailureAnalysisCard` takes `Diagnosis` (`rootCause`, `faultDomain` chip, `ConfidenceMeter value={confidence}`). Every panel renders ONLY when its data array/object exists and is non-empty — absent capture means absent panel, no empty-state cards (ADR-0006: absence renders nothing).
- [ ] **Step 3: ExportMenu trim** — remove the Jira item and its modal wholesale; `buildReport` serializes `{ generatedAt, runId, target, finding }` (the actual `Finding` object — no mock fields); `buildTextSummary` becomes markdown: `## <kind label>: <title>`, detail, diagnosis block when present, environment line, `Evidence: <n> screenshots, video` — clipboard-ready for any tracker. Download filename: `<finding.id>.json`.
- [ ] **Step 4: ResolutionActions** — buttons per CONTEXT.md: Dismiss (regression), Suppress (advisory), Reject (heal — rendered on the Heal card in Overview/FlowDetails); hidden entirely when `capabilities.resolutionActions` is false; confirm-free (all reversible via git in the user's repo — Dismiss warns inline: "deletes the Flow from the Flow Map"). POST via relative `fetch('api/findings/${id}/dismiss', { method: 'POST' })`; on 200, update local state to strike through + badge the resolution; on error render the server's `error` string inline beside the button. Heals render in Overview under their own tier section (summary, evidence video link, Reject button → expects the 501 message inline, which is correct current behavior).
- [ ] **Step 5: Verify + visual QA** — `npm run build:viewer && npm test && npm run typecheck`; glossary grep gate again; then with the dev server on the fixture: `agent-browser` captures `docs/assets/viewer-overview.png`, `viewer-finding-hard-failure.png` (diagnosis + all panels), `viewer-flows.png`, plus an all-clear variant (temporarily empty the fixture findings, screenshot, restore). Replace the two stale dossier screenshots in `docs/assets/` (delete `report-all-clear.png`, `report-failure.png`) and update the README image references (`grep -n "docs/assets" README.md`).
- [ ] **Step 6: Commit** — `git commit -m "feat: full investigation suite — video-seeking evidence, diagnosis, export, resolution actions"`

---

## Out of scope (explicit)

- Diagnosis producers (explorer prompt extension + bounded post-replay pass) — blocked on the in-flight Cursor-SDK/hands research threads; ADR-0006 records the decision, the fixture proves the rendering.
- Heal production and therefore live Reject flow (endpoint intentionally 501).
- Suppression fingerprinting beyond exact title match.
- Cross-run analytics (ADR-0004).
