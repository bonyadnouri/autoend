import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { flowMapDir, saveFlowMeta, type FlowMeta } from '../map/flow-map.js';
import type { Transition } from '../graph/graph.js';
import { pushVisit, transitionsFromVisits } from '../graph/record.js';
import type { Finding, Heal } from '../report/types.js';

export interface ReplayResult {
  replayed: number;
  findings: Finding[];
  heals: Heal[];
  /** Observed navigations, for the interaction graph (issue #16). */
  transitions: Transition[];
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

export interface ScriptOutcome {
  ok: boolean;
  error?: string;
  /** Evidence filename within evidenceDir (WebM). */
  evidence?: string;
  /** Ordered main-frame URLs the Flow visited, for the interaction graph. */
  visits: string[];
}

/**
 * Execute one Flow script in a fresh recording browser context. Shared by
 * replay (map scripts) and exploration (verify-by-running a proposed script
 * before it may enter the Flow Map, ADR-0002).
 */
export async function runFlowScript(
  browser: Browser,
  scriptPath: string,
  target: URL,
  evidenceDir: string,
  videoBase: string,
): Promise<ScriptOutcome> {
  const context = await browser.newContext({ recordVideo: { dir: evidenceDir } });
  // TODO: inject shared storage state (src/auth/session.ts) once fleet auth exists.
  const page = await context.newPage();

  // Record the main frame's navigations to feed the interaction graph (#16).
  const visits: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) pushVisit(visits, frame.url());
  });

  let failure: unknown;
  try {
    const script = await loadFlowScript(scriptPath);
    await withTimeout(script(page, target), FLOW_TIMEOUT_MS, videoBase);
  } catch (error) {
    failure = error;
  }
  const video = page.video();
  await context.close(); // finalizes the recording
  let evidence: string | undefined;
  if (video) {
    evidence = `${videoBase}.webm`;
    await rename(await video.path(), join(evidenceDir, evidence));
  }
  if (failure !== undefined) {
    return { ok: false, error: failure instanceof Error ? failure.message : String(failure), evidence, visits };
  }
  return { ok: true, evidence, visits };
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
    return { replayed: 0, findings: [], heals: [], transitions: [] };
  }
  const transitions: Transition[] = [];
  const browser = await chromium.launch();
  try {
    const outcomes = await withPool(flows, REPLAY_WORKERS, async (flow) => {
      const scriptPath = join(flowMapDir(repoRoot), flow.id, 'flow.mts');
      const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, flow.id);
      transitions.push(...transitionsFromVisits(outcome.visits));
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
        };
        return finding;
      }
      await saveFlowMeta(repoRoot, { ...flow, lastPassedAt: new Date().toISOString() });
      return undefined;
    });
    return {
      replayed: flows.length,
      findings: outcomes.filter((f): f is Finding => f !== undefined),
      heals: [],
      transitions,
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
