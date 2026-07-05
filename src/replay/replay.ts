import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { flowMapDir, saveFlowMeta, type FlowMeta } from '../map/flow-map.js';
import type {
  ConsoleEntry,
  Finding,
  FlowSnapshot,
  Heal,
  NetworkEntry,
  Screenshot,
  StepResult,
} from '../report/types.js';
import { withoutSensitiveEnv } from '../run/sensitive-env.js';
import { NoopReporter, type RunReporter } from '../stream/index.js';
import { edgeId, screenId, screenTitle } from '../stream/screen-id.js';

export interface ReplayResult {
  replayed: number;
  findings: Finding[];
  heals: Heal[];
  /** One snapshot per replayed Flow — the Report's receipts (CONTEXT.md: Report). */
  flows: FlowSnapshot[];
  /** Chromium build string, present when a browser was actually launched. */
  browserVersion?: string;
}

/**
 * A Flow's executable steps (ADR-0002): a plain Playwright script, default-
 * exporting an async function. Scripts are Target-relative — they receive the
 * Run's Target and navigate via `new URL(path, target)` — so the same Flow
 * replays against localhost today and staging tomorrow. A Flow asserts by
 * throwing; returning normally means the Flow's goal was achieved.
 *
 * Scripts are .mts executed via native Node type stripping (Node >= 23.6).
 */
export type FlowScript = (page: Page, target: URL) => Promise<void>;

const FLOW_TIMEOUT_MS = 60_000;
const REPLAY_WORKERS = 4;
const VIEWPORT = { width: 1280, height: 720 };
const CAPTURE_CAP = 50; // per stream; drop beyond, note nothing — caps keep report.json bounded
/**
 * Extra time the recording keeps rolling after the script returns, so the WebM
 * captures the final state (the last action's result) instead of cutting off
 * the instant the flow ends. Applied to every Playwright-recorded flow.
 */
const VIDEO_TAIL_MS = 1_500;

export interface FlowStreamContext {
  reporter?: RunReporter;
  flowId?: string;
  flowTitle?: string;
  /** Mark navigated screens as newly discovered (exploration verify pass). */
  discover?: boolean;
}

export interface ScriptOutcome {
  ok: boolean;
  error?: string;
  /** Evidence filename within evidenceDir (WebM). */
  evidence?: string;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  timeline: StepResult[];
  screenshots: Screenshot[];
  durationMs: number;
  visitedScreenIds: string[];
  /**
   * Set when the script ran to completion but the final page's document
   * response was an HTTP error (>= 400). The script "succeeded" mechanically,
   * yet the user landed on a broken page — a semantic failure the flow's
   * pass/fail must reflect. HTTP 200 (incl. SPA soft-404s) is treated as pass.
   */
  badEndState?: string;
  /**
   * Navigations whose top-level document responded HTTP >= 400. These are NOT
   * real screens — they're suppressed/removed from the graph and surface as
   * "expected page missing" warning findings instead. Keyed screen id + status.
   */
  badScreens: Array<{ id: string; status: number }>;
}

/**
 * Execute one Flow script in a fresh recording browser context. Shared by
 * replay (map scripts) and exploration (verify-by-running a proposed script
 * before it may enter the Flow Map, ADR-0002). Alongside the WebM Evidence it
 * captures the panels the viewer renders (ADR-0005): console/page errors,
 * failed network, a navigation timeline, and before/after screenshots.
 */
export async function runFlowScript(
  browser: Browser,
  scriptPath: string,
  target: URL,
  evidenceDir: string,
  videoBase: string,
  stream: FlowStreamContext = {},
): Promise<ScriptOutcome> {
  const reporter = stream.reporter ?? NoopReporter;
  let prevScreenId: string | undefined;
  const visitedScreenIds: string[] = [];
  const context = await browser.newContext({ recordVideo: { dir: evidenceDir }, viewport: VIEWPORT });
  // TODO: inject shared storage state (src/auth/session.ts) once fleet auth exists.
  const page = await context.newPage();

  const startedMs = Date.now();
  const consoleEntries: ConsoleEntry[] = [];
  const network: NetworkEntry[] = [];
  const timeline: StepResult[] = [];
  const screenshots: Screenshot[] = [];
  // HTTP status of the last top-level document navigation — i.e. the status of
  // the page the user ends on. Drives the flow's semantic pass/fail.
  let finalStatus: number | undefined;
  // Top-level document status keyed by the CONCRETE url pathname — not the
  // normalized screen id. Two instances of a dynamic route (/products/1 and
  // /products/999) collapse to one screen id, but only one may 404; keying by
  // concrete path stops a single 404 from dropping the whole screen. A path
  // whose document came back HTTP >= 400 is not a real screen: it's suppressed
  // from the graph and reported as a warning. Usually 'response' fires before
  // 'framenavigated', so we skip emission up front; the sweep catches late statuses.
  const docStatusByPath = new Map<string, number>();
  // Concrete pathname each visited screen id last navigated to, so the post-run
  // sweep can re-check that navigation's document status by the same concrete key.
  const pathBySid = new Map<string, string>();
  const badScreens = new Map<string, number>();
  // Wall-clock request start times so the network panel can show round-trips —
  // Playwright's request.timing() isn't populated yet at the 'response' event.
  const requestStartMs = new WeakMap<import('playwright').Request, number>();

  const screenshot = async (label: Screenshot['label'], file: string): Promise<void> => {
    try {
      await page.screenshot({ path: join(evidenceDir, file) });
      screenshots.push({ file, label, tMs: Date.now() - startedMs });
    } catch {
      // A crashed or closed page must not mask the Flow's own error.
    }
  };

  page.on('console', (msg) => {
    // Capture every tier (log/info/debug/warning/error) so the console tab shows
    // the full run, not only failures. Unknown types collapse to 'log'.
    const type = msg.type();
    const level =
      type === 'error'
        ? 'error'
        : type === 'warning'
          ? 'warning'
          : type === 'info'
            ? 'info'
            : type === 'debug'
              ? 'debug'
              : 'log';
    if (consoleEntries.length < CAPTURE_CAP)
      consoleEntries.push({ level, text: msg.text(), tMs: Date.now() - startedMs });
  });
  page.on('pageerror', (err) => {
    if (consoleEntries.length < CAPTURE_CAP)
      consoleEntries.push({ level: 'error', text: String(err), tMs: Date.now() - startedMs });
  });
  page.on('request', (req) => {
    requestStartMs.set(req, Date.now());
  });
  page.on('response', (res) => {
    const req = res.request();
    const type = req.resourceType();
    // Track the final top-level document response; ignore XHR/fetch/assets and
    // sub-frames so a failed API call mid-flow doesn't fail an otherwise-fine
    // page. Redirects (3xx) get overwritten by the final destination's status.
    if (type === 'document' && res.frame() === page.mainFrame()) {
      finalStatus = res.status();
      docStatusByPath.set(new URL(res.url()).pathname, res.status());
    }
    // Log meaningful endpoints (navigations + API calls) whether they succeed or
    // fail, plus any failed request of any type (a broken image/script is worth
    // showing) — successful asset chatter (img/css/font) is dropped for signal.
    const isEndpoint = type === 'document' || type === 'xhr' || type === 'fetch';
    if ((isEndpoint || res.status() >= 400) && network.length < CAPTURE_CAP) {
      const start = requestStartMs.get(req);
      const durationMs = start !== undefined ? Date.now() - start : undefined;
      network.push({ method: req.method(), url: res.url(), status: res.status(), tMs: Date.now() - startedMs, durationMs });
    }
  });
  page.on('requestfailed', (req) => {
    if (network.length < CAPTURE_CAP)
      network.push({ method: req.method(), url: req.url(), status: 0, tMs: Date.now() - startedMs });
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame() || frame.url() === 'about:blank' || timeline.length >= CAPTURE_CAP) return;
    const path = new URL(frame.url()).pathname;
    timeline.push({ label: `goto ${path}`, status: 'passed', tMs: Date.now() - startedMs });
    const sid = screenId(frame.url());
    // The document response usually landed already: if this CONCRETE path came
    // back HTTP >= 400 it isn't a real screen — don't emit it, don't advance the
    // edge chain past it, just record it as a bad destination for a warning.
    const knownStatus = docStatusByPath.get(path);
    if (knownStatus !== undefined && knownStatus >= 400) {
      badScreens.set(sid, knownStatus);
      return;
    }
    // Remember the concrete path this screen resolved to so the sweep can
    // re-check a document status that arrives after this event.
    pathBySid.set(sid, path);
    if (!visitedScreenIds.includes(sid)) visitedScreenIds.push(sid);
    void reporter.screenSeen({
      id: sid,
      path: sid,
      title: screenTitle(sid),
      status: 'running',
    });
    void reporter.event({
      type: 'screen',
      screenId: sid,
      path: sid,
      state: stream.discover ? 'discovered' : 'visited',
    });
    if (prevScreenId && prevScreenId !== sid) {
      void reporter.edgeSeen({
        id: edgeId(prevScreenId, sid),
        source: prevScreenId,
        target: sid,
        label: stream.flowTitle ?? `goto ${path}`,
        status: 'normal',
      });
    }
    prevScreenId = sid;
  });
  // First main-frame load → the "before" screenshot; awaited below so it always precedes "after".
  let beforeShot: Promise<void> | undefined;
  page.once('load', () => {
    beforeShot = screenshot('before', `${videoBase}-before.png`);
  });

  let failure: unknown;
  try {
    const script = await loadFlowScript(scriptPath);
    await withTimeout(script(page, target), FLOW_TIMEOUT_MS, videoBase);
  } catch (error) {
    failure = error;
  }

  if (beforeShot) await beforeShot;
  if (failure !== undefined) {
    const message = failure instanceof Error ? failure.message : String(failure);
    timeline.push({ label: message.slice(0, 80), status: 'failed', tMs: Date.now() - startedMs });
    await screenshot('at-failure', `${videoBase}-at-failure.png`);
  } else {
    await screenshot('after', `${videoBase}-after.png`);
  }

  // Let the recording roll a beat longer so the final state lands in the WebM
  // rather than being clipped the moment the script returns. Plain sleep (not
  // page.waitForTimeout) so a crashed/closed page can't turn this into an error.
  await new Promise((resolve) => setTimeout(resolve, VIDEO_TAIL_MS));

  const video = page.video();
  await context.close(); // finalizes the recording
  let evidence: string | undefined;
  if (video) {
    evidence = `${videoBase}.webm`;
    await rename(await video.path(), join(evidenceDir, evidence));
  }
  const durationMs = Date.now() - startedMs;
  // Post-run sweep: any visited screen whose document status arrived after its
  // 'framenavigated' (so it slipped past the up-front skip) and turned out to be
  // HTTP >= 400 is dropped from the graph and reclassified as a bad destination.
  const goodVisited: string[] = [];
  for (const sid of visitedScreenIds) {
    const status = docStatusByPath.get(pathBySid.get(sid) ?? '');
    if (status !== undefined && status >= 400) {
      badScreens.set(sid, status);
      void reporter.screenDropped(sid);
    } else {
      goodVisited.push(sid);
    }
  }
  const capture = {
    console: consoleEntries,
    network,
    timeline,
    screenshots,
    durationMs,
    evidence,
    visitedScreenIds: goodVisited,
    badScreens: [...badScreens].map(([id, status]) => ({ id, status })),
  };
  if (failure !== undefined) {
    return { ok: false, error: failure instanceof Error ? failure.message : String(failure), ...capture };
  }
  // Script ran clean, but if the user ended on an HTTP error page the flow is a
  // semantic failure — the objective signal is the final document's status.
  const badEndState =
    finalStatus !== undefined && finalStatus >= 400
      ? `Final page returned HTTP ${finalStatus}`
      : undefined;
  return { ok: true, badEndState, ...capture };
}

export interface ReplayStreamContext {
  reporter?: RunReporter;
}

/**
 * Phase 1 of every Run: replay the whole Flow Map — headless, parallel,
 * recording WebM Evidence per Flow via Playwright's recordVideo (ADR-0002).
 * Always completes at any Effort (CONTEXT.md: Effort).
 */
export async function replayFlowMap(
  repoRoot: string,
  target: URL,
  flows: FlowMeta[],
  evidenceDir: string,
  stream: ReplayStreamContext = {},
): Promise<ReplayResult> {
  const reporter = stream.reporter ?? NoopReporter;
  if (flows.length === 0) {
    return { replayed: 0, findings: [], heals: [], flows: [] };
  }
  await reporter.event({ type: 'phase', phase: 'replay', state: 'started' });
  const browser = await chromium.launch();
  try {
    const browserVersion = browser.version();
    // Map scripts are LLM-authored and imported in-process (ADR-0002); hide
    // secrets from them while the whole pool runs (issue #3). Scrubbing wraps
    // the batch, not each script, because process.env is process-global.
    const results = await withoutSensitiveEnv(() =>
      withPool(
        flows,
        REPLAY_WORKERS,
        async (
          flow,
        ): Promise<{
          snapshot: FlowSnapshot;
          finding?: Finding;
          missing: Finding[];
          /** Screen ids this flow visited, in navigation order. */
          visited: string[];
          /** The screen a thrown script failed ON, if any (post-pool settlement). */
          failedScreenId?: string;
        }> => {
          const scriptPath = join(flowMapDir(repoRoot), flow.id, 'flow.mts');
          // Capture the exact script we replay so the Report (and the DB) carry a
          // portable reproduction, not just a pointer into the local Flow Map.
          const script = await readFile(scriptPath, 'utf8').catch(() => undefined);
          await reporter.event({ type: 'flow', flowId: flow.id, title: flow.title, state: 'started' });
          await reporter.testStatus({ testId: flow.id, title: flow.title, status: 'running' });
          const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, flow.id, {
            reporter,
            flowId: flow.id,
            flowTitle: flow.title,
          });
          // A flow fails if its script threw OR it ended on an HTTP error page.
          const failureReason = outcome.ok ? outcome.badEndState : (outcome.error ?? 'unknown failure');
          const failed = Boolean(failureReason);
          // Broken destinations the flow tried to reach (HTTP >= 400) aren't
          // screens — report each as a warning so the user still gets feedback.
          const missing = missingPageFindings(outcome.badScreens, flow.id);
          // Redden the last screen only when the script actually threw ON a real
          // page (outcome.ok === false). A flow that failed because it ENDED on a
          // 404 (outcome.ok === true, badEndState set) already had that phantom
          // screen dropped from the graph and surfaced as a warning node — there's
          // no real screen to redden. Screen/edge statuses are SETTLED AFTER the
          // whole pool finishes (see below), never per flow: flows replay in
          // parallel and the reporter serializes writes, so a passing flow settling
          // last would otherwise overwrite a failing flow's red on a shared screen.
          const scriptThrew = !outcome.ok;
          const ids = outcome.visitedScreenIds;
          const failedScreenId = failed && scriptThrew && ids.length > 0 ? ids[ids.length - 1] : undefined;
          const snapshot: FlowSnapshot = {
            id: flow.id,
            title: flow.title,
            status: failed ? 'failed' : 'passed',
            discoveredAt: flow.discoveredAt,
            lastPassedAt: flow.lastPassedAt,
            timeline: outcome.timeline,
            evidence: outcome.evidence,
            durationMs: outcome.durationMs,
            console: outcome.console,
            network: outcome.network,
            script,
          };
          if (failed) {
            await reporter.testStatus({
              testId: flow.id,
              title: flow.title,
              status: 'failed',
              detail: failureReason,
              console: outcome.console,
              network: outcome.network,
              timeline: outcome.timeline,
              durationMs: outcome.durationMs,
              script,
            });
            await reporter.event({ type: 'flow', flowId: flow.id, title: flow.title, state: 'failed' });
            // TODO(ADR-0001): attempt a Heal (re-achieve the Flow's goal via an agent)
            // before reporting. Until healing exists, every failure is a Regression.
            const finding: Finding = {
              id: `regression-${flow.id}`,
              kind: 'regression',
              flowId: flow.id,
              title: outcome.badEndState
                ? `Flow "${flow.title}" ends on an error page`
                : `Flow "${flow.title}" failed on replay`,
              detail: failureReason ?? 'unknown failure',
              evidence: outcome.evidence,
              console: outcome.console,
              network: outcome.network,
              timeline: outcome.timeline,
              screenshots: outcome.screenshots,
            };
            return { snapshot, finding, missing, visited: ids, failedScreenId };
          }
          await reporter.testStatus({
            testId: flow.id,
            title: flow.title,
            status: 'passed',
            durationMs: outcome.durationMs,
            timeline: outcome.timeline,
            script,
          });
          await reporter.event({ type: 'flow', flowId: flow.id, title: flow.title, state: 'passed' });
          const lastPassedAt = new Date().toISOString();
          await saveFlowMeta(repoRoot, { ...flow, lastPassedAt });
          snapshot.lastPassedAt = lastPassedAt;
          return { snapshot, missing, visited: ids, failedScreenId };
        },
      ),
    );
    // Settle final screen + edge statuses ONCE, after every flow has replayed.
    // A screen is failed if ANY flow failed on it, else passed; the inbound edge
    // to a failure screen is marked broken. Doing this post-pool — not per flow —
    // stops a passing flow that happened to finish later from overwriting a
    // failing flow's red on a shared screen/edge (the reporter serializes writes,
    // so otherwise last-write-by-completion-order silently decided the color).
    const screenStatus = new Map<string, 'passed' | 'failed'>();
    const brokenEdges = new Map<string, { source: string; target: string; label: string }>();
    for (const r of results) {
      for (const sid of r.visited) if (!screenStatus.has(sid)) screenStatus.set(sid, 'passed');
    }
    for (const r of results) {
      if (!r.failedScreenId) continue;
      screenStatus.set(r.failedScreenId, 'failed');
      const idx = r.visited.indexOf(r.failedScreenId);
      const prev = idx > 0 ? r.visited[idx - 1] : undefined;
      if (prev) {
        brokenEdges.set(edgeId(prev, r.failedScreenId), {
          source: prev,
          target: r.failedScreenId,
          label: r.snapshot.title,
        });
      }
    }
    for (const [sid, status] of screenStatus) {
      await reporter.screenSeen({ id: sid, path: sid, title: screenTitle(sid), status });
    }
    for (const [id, e] of brokenEdges) {
      await reporter.edgeSeen({ id, source: e.source, target: e.target, label: e.label, status: 'broken' });
    }
    await reporter.event({ type: 'phase', phase: 'replay', state: 'finished' });
    // Dedupe missing-page warnings by id — several flows may hit the same 404.
    const missingById = new Map<string, Finding>();
    for (const r of results) for (const f of r.missing) missingById.set(f.id, f);
    const findings = [
      ...results.map((r) => r.finding).filter((f): f is Finding => f !== undefined),
      ...missingById.values(),
    ];
    return {
      replayed: flows.length,
      findings,
      heals: [],
      flows: results.map((r) => r.snapshot),
      browserVersion,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Turn broken navigation destinations (HTTP >= 400) into warning findings. A
 * 404 is an "expected page missing" advisory (→ warning), while a 5xx is a real
 * server error (hard-failure). Ids are keyed by screen id so identical misses
 * across flows collapse to one issue/insight.
 */
function missingPageFindings(
  badScreens: Array<{ id: string; status: number }>,
  flowId: string,
): Finding[] {
  return badScreens.map(({ id, status }) => ({
    id: `missing-${id}`,
    kind: status >= 500 ? 'hard-failure' : 'advisory',
    flowId,
    title:
      status >= 500
        ? `Page "${id}" failed to load (HTTP ${status})`
        : `Expected page "${id}" but it was not present (HTTP ${status})`,
    detail:
      status >= 500
        ? `A navigation to "${id}" returned HTTP ${status}. The destination exists in the UI but the server errored.`
        : `A link/navigation pointed to "${id}" but it responded HTTP ${status}, so it is not a real screen.`,
  }));
}

async function loadFlowScript(scriptPath: string): Promise<FlowScript> {
  // Query param busts the ESM cache so a Healed script reloads within one process.
  const module = (await import(`${pathToFileURL(scriptPath).href}?v=${Date.now()}`)) as {
    default?: unknown;
  };
  if (typeof module.default !== 'function') {
    throw new Error(`${scriptPath} must default-export an async (page, target) function`);
  }
  return module.default as FlowScript;
}

async function withTimeout(work: Promise<void>, ms: number, label: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`flow "${label}" timed out after ${ms / 1000}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function withPool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await work(items[i]);
      }
    }),
  );
  return results;
}
