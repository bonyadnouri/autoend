import { copyFile, rename, stat } from 'node:fs/promises';
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
import { compareToBaseline } from '../visual/baseline.js';

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
): Promise<ScriptOutcome> {
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
    await page
      .addStyleTag({
        content:
          '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
      })
      .catch(() => undefined);
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
  const capture = { console: consoleEntries, network, timeline, screenshots, durationMs, evidence };
  if (failure !== undefined) {
    return { ok: false, error: failure instanceof Error ? failure.message : String(failure), ...capture };
  }
  return { ok: true, ...capture };
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
): Promise<ReplayResult> {
  if (flows.length === 0) {
    return { replayed: 0, findings: [], heals: [], flows: [] };
  }
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
          const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, flow.id);
          const snapshot: FlowSnapshot = {
            id: flow.id,
            title: flow.title,
            status: outcome.ok ? 'passed' : 'failed',
            discoveredAt: flow.discoveredAt,
            lastPassedAt: flow.lastPassedAt,
            timeline: outcome.timeline,
            evidence: outcome.evidence,
            durationMs: outcome.durationMs,
          };
          if (!outcome.ok) {
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
          const lastPassedAt = new Date().toISOString();
          let baselineFinding: Finding | undefined;
          const afterShot = outcome.screenshots.find((s) => s.label === 'after');
          if (afterShot) {
            const afterPath = join(evidenceDir, afterShot.file);
            const baselinePath = join(flowMapDir(repoRoot), flow.id, 'baseline.png');
            try {
              await stat(baselinePath);
              const baselineEvidenceDir = join(evidenceDir, 'visual-baseline', flow.id);
              const compared = await compareToBaseline(baselinePath, afterPath, baselineEvidenceDir, {
                flowId: flow.id,
                flowTitle: flow.title,
                evidencePrefix: `visual-baseline/${flow.id}/`,
              });
              baselineFinding = compared.finding;
            } catch {
              await copyFile(afterPath, baselinePath);
              await saveFlowMeta(repoRoot, { ...flow, lastPassedAt, baselineCapturedAt: lastPassedAt });
              snapshot.lastPassedAt = lastPassedAt;
              return { snapshot, finding: baselineFinding };
            }
          }
          await saveFlowMeta(repoRoot, { ...flow, lastPassedAt });
          snapshot.lastPassedAt = lastPassedAt;
          return { snapshot, finding: baselineFinding };
        },
      ),
    );
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
