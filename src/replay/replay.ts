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

  const screenshot = async (label: Screenshot['label'], file: string): Promise<void> => {
    try {
      await page.screenshot({ path: join(evidenceDir, file) });
      screenshots.push({ file, label, tMs: Date.now() - startedMs });
    } catch {
      // A crashed or closed page must not mask the Flow's own error.
    }
  };

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
    if (frame !== page.mainFrame() || frame.url() === 'about:blank' || timeline.length >= CAPTURE_CAP) return;
    const path = new URL(frame.url()).pathname;
    timeline.push({ label: `goto ${path}`, status: 'passed', tMs: Date.now() - startedMs });
    const sid = screenId(frame.url());
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

  const video = page.video();
  await context.close(); // finalizes the recording
  let evidence: string | undefined;
  if (video) {
    evidence = `${videoBase}.webm`;
    await rename(await video.path(), join(evidenceDir, evidence));
  }
  const durationMs = Date.now() - startedMs;
  const capture = { console: consoleEntries, network, timeline, screenshots, durationMs, evidence, visitedScreenIds };
  if (failure !== undefined) {
    return { ok: false, error: failure instanceof Error ? failure.message : String(failure), ...capture };
  }
  return { ok: true, ...capture };
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
        async (flow): Promise<{ snapshot: FlowSnapshot; finding?: Finding }> => {
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
          const settleScreens = async (status: 'passed' | 'failed') => {
            const ids = outcome.visitedScreenIds;
            for (let i = 0; i < ids.length; i++) {
              const screenStatus = status === 'failed' && i === ids.length - 1 ? 'failed' : 'passed';
              await reporter.screenSeen({ id: ids[i]!, path: ids[i]!, status: screenStatus });
            }
          };
          const snapshot: FlowSnapshot = {
            id: flow.id,
            title: flow.title,
            status: outcome.ok ? 'passed' : 'failed',
            discoveredAt: flow.discoveredAt,
            lastPassedAt: flow.lastPassedAt,
            timeline: outcome.timeline,
            evidence: outcome.evidence,
            durationMs: outcome.durationMs,
            script,
          };
          if (!outcome.ok) {
            await settleScreens('failed');
            await reporter.testStatus({
              testId: flow.id,
              title: flow.title,
              status: 'failed',
              detail: outcome.error ?? 'unknown failure',
              console: outcome.console,
              network: outcome.network,
              timeline: outcome.timeline,
              durationMs: outcome.durationMs,
            });
            await reporter.event({ type: 'flow', flowId: flow.id, title: flow.title, state: 'failed' });
            // TODO(ADR-0001): attempt a Heal (re-achieve the Flow's goal via an agent)
            // before reporting. Until healing exists, every failure is a Regression.
            const finding: Finding = {
              id: `regression-${flow.id}`,
              kind: 'regression',
              flowId: flow.id,
              title: `Flow "${flow.title}" failed on replay`,
              detail: outcome.error ?? 'unknown failure',
              evidence: outcome.evidence,
              console: outcome.console,
              network: outcome.network,
              timeline: outcome.timeline,
              screenshots: outcome.screenshots,
            };
            return { snapshot, finding };
          }
          await settleScreens('passed');
          await reporter.testStatus({
            testId: flow.id,
            title: flow.title,
            status: 'passed',
            durationMs: outcome.durationMs,
            timeline: outcome.timeline,
          });
          await reporter.event({ type: 'flow', flowId: flow.id, title: flow.title, state: 'passed' });
          const lastPassedAt = new Date().toISOString();
          await saveFlowMeta(repoRoot, { ...flow, lastPassedAt });
          snapshot.lastPassedAt = lastPassedAt;
          return { snapshot };
        },
      ),
    );
    await reporter.event({ type: 'phase', phase: 'replay', state: 'finished' });
    return {
      replayed: flows.length,
      findings: results.map((r) => r.finding).filter((f): f is Finding => f !== undefined),
      heals: [],
      flows: results.map((r) => r.snapshot),
      browserVersion,
    };
  } finally {
    await browser.close();
  }
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
