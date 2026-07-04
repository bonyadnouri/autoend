import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Agent } from '@cursor/sdk';
import { chromium } from 'playwright';
import { addFlow, type FlowMeta } from '../map/flow-map.js';
import { runFlowScript } from '../replay/replay.js';
import type { ExplorationBudget } from '../run/effort.js';
import type { Finding, FlowSnapshot } from '../report/types.js';
import { withoutSensitiveEnv } from '../run/sensitive-env.js';
import { closeSession } from './hands.js';

export interface ExploreOptions {
  repoRoot: string;
  target: URL;
  budget: ExplorationBudget;
  /** This Run's artifact directory — explorers get a scratch dir inside it. */
  runDir: string;
  evidenceDir: string;
  knownFlows: FlowMeta[];
}

export interface ExplorationResult {
  discovered: number;
  findings: Finding[];
  /** A snapshot per newly discovered Flow — the Report's receipts (CONTEXT.md: Report). */
  flows: FlowSnapshot[];
}

export interface ProposedFlow {
  id: string;
  title: string;
  script: string;
}

export interface ExplorerReport {
  flows: ProposedFlow[];
  findings: Array<{ kind: 'hard-failure' | 'advisory'; title: string; detail: string }>;
}

/** Each explorer gets a distinct lens so the fleet doesn't converge on one path. */
const LENSES = [
  'Walk the primary user journey end to end, starting from the landing page — the path a first-time visitor is meant to take.',
  'Exercise forms and inputs: search, signup, login, contact. Fill them with plausible test data and submit.',
  'Explore navigation: menus, headers, footers, secondary pages. Verify links lead somewhere real.',
  'Probe edge behavior: empty states, browser back/forward, repeating an action twice, unusual but legitimate input.',
];

/**
 * Extra wall-clock the hard stop allows past the soft deadline given to
 * agents. Live-run data: explorers on a multi-page target need 60-100s wall
 * clock at low effort ('auto' model, 5-15s/turn) — a tight grace starves them
 * right before they report, losing all their work.
 */
const GRACE_MS = 60_000;

/**
 * Phase 2 of a Run (ADR-0001/0003): spawn Cursor local agents that hold the
 * agent-browser CLI through the SDK's shell tool, each in an isolated browser
 * session, time-boxed by the Effort budget. Flows they propose only enter the
 * Flow Map after verify-by-running via the replay engine (ADR-0002).
 */
export async function explore(opts: ExploreOptions): Promise<ExplorationResult> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.warn('exploration skipped: CURSOR_API_KEY not set — run `npx @bonyadnouri/autoend init`');
    return { discovered: 0, findings: [], flows: [] };
  }

  const workDir = join(opts.runDir, 'explore');
  await mkdir(workDir, { recursive: true });

  const reports = await Promise.all(
    Array.from({ length: opts.budget.explorers }, (_, i) => runExplorer(i, apiKey, workDir, opts)),
  );

  const findings: Finding[] = [];
  for (const [i, report] of reports.entries()) {
    if (!report) continue;
    const evidence = `explore-${i}.webm`;
    const recorded = await access(join(opts.evidenceDir, evidence)).then(
      () => true,
      () => false,
    );
    for (const [n, f] of report.findings.entries()) {
      findings.push({
        id: `explore-${i}-${n}`,
        kind: f.kind,
        title: f.title,
        detail: f.detail,
        evidence: recorded ? evidence : undefined,
      });
    }
  }

  const proposed = collectProposedFlows(reports, opts.knownFlows);
  const flowSnapshots: FlowSnapshot[] = [];
  if (proposed.length > 0) {
    // Verify-by-running executes LLM-authored scripts in-process (ADR-0002).
    // Hide secrets from them for the duration (issue #3).
    await withoutSensitiveEnv(async () => {
      const browser = await chromium.launch();
      try {
        for (const flow of proposed) {
          const scriptPath = join(workDir, `${flow.id}.mts`);
          await writeFile(scriptPath, flow.script);
          const outcome = await runFlowScript(browser, scriptPath, opts.target, opts.evidenceDir, `discovered-${flow.id}`);
          if (outcome.ok) {
            const now = new Date().toISOString();
            await addFlow(opts.repoRoot, { id: flow.id, title: flow.title, discoveredAt: now, lastPassedAt: now }, flow.script);
            flowSnapshots.push({
              id: flow.id,
              title: flow.title,
              status: 'discovered',
              discoveredAt: now,
              lastPassedAt: now,
              timeline: outcome.timeline,
              evidence: outcome.evidence,
              durationMs: outcome.durationMs,
            });
          } else {
            console.warn(`proposed flow "${flow.id}" failed verification and was discarded: ${outcome.error}`);
          }
        }
      } finally {
        await browser.close();
      }
    });
  }

  return { discovered: flowSnapshots.length, findings, flows: flowSnapshots };
}

async function runExplorer(
  index: number,
  apiKey: string,
  workDir: string,
  opts: ExploreOptions,
): Promise<ExplorerReport | undefined> {
  const session = `autoend-x${index}`;
  const agent = await Agent.create({
    name: `autoend-explorer-${index}`,
    model: { id: 'auto' },
    apiKey,
    local: { cwd: workDir },
  });
  try {
    const run = await agent.send(explorerPrompt(index, session, opts));
    const outcome = (await Promise.race([
      run.wait(),
      sleep(opts.budget.seconds * 1000 + GRACE_MS).then(() => 'timeout' as const),
    ])) as 'timeout' | { status: string; result?: string; error?: { message?: string } };

    if (outcome === 'timeout') {
      await run.cancel().catch(() => {});
      console.warn(`explorer ${index} hit the time budget before reporting`);
      return undefined;
    }
    if (outcome.status !== 'finished' || typeof outcome.result !== 'string') {
      console.warn(`explorer ${index} ended with status "${outcome.status}"${outcome.error?.message ? `: ${outcome.error.message}` : ''}`);
      return undefined;
    }
    const report = parseExplorerReport(outcome.result);
    if (!report) console.warn(`explorer ${index} returned an unparseable report`);
    return report;
  } finally {
    agent.close();
    await closeSession(session);
  }
}

function explorerPrompt(index: number, session: string, opts: ExploreOptions): string {
  const { target, budget, evidenceDir, knownFlows } = opts;
  const videoPath = join(evidenceDir, `explore-${index}.webm`);
  const known =
    knownFlows.length > 0
      ? knownFlows.map((f) => `- ${f.title}`).join('\n')
      : '(none yet — this is the first exploration of this app)';

  return `You are autoend explorer #${index}, part of a fleet testing a web app end-to-end. You have ${budget.seconds} seconds of exploration; ${Math.round(GRACE_MS / 1000)}s after that deadline you are hard-killed and any unreported work is LOST — so report early rather than perfectly.

TARGET: ${target.href}
Your lens: ${LENSES[index % LENSES.length]}

## Your browser
Drive the browser with the agent-browser CLI via shell. EVERY command MUST include \`--session ${session}\` (other agents share the daemon; the flag isolates your browser).

SPEED MATTERS: every shell call costs you a turn. BATCH commands whenever possible.

Protocol — first shell call (one batch):
  agent-browser --session ${session} batch "open ${target.href}" "record start ${videoPath}" "snapshot -i -c"
Work loop (batch an action with the checks that follow it):
  agent-browser --session ${session} batch "click @e12" "get url" "snapshot -i -c" "console" "errors"
  agent-browser --session ${session} batch "fill @e5 test@example.com" "click @e7" "snapshot -i -c"
Protocol — last shell call (NEVER skip, even when out of time):
  agent-browser --session ${session} batch "record stop" "close"

## Hard rules
- NEVER navigate off the origin ${target.origin} — if a click leaves it, go back immediately.
- Avoid destructive or irreversible actions (deleting data, real purchases, sending messages to third parties) unless a flow cannot be completed otherwise.
- Do not read or modify files outside your working directory. Your only tools are agent-browser and trivial shell.

## What to produce
1. FLOWS — user-meaningful paths you verified work (e.g. "Visitor completes checkout"). Known flows, do NOT re-propose:
${known}
   For each NEW flow, write a Playwright script:
   - default-export \`async function flow(page, target)\` — no imports; use only the \`page\` (Playwright Page) and \`target\` (URL) arguments
   - navigate target-relative: \`await page.goto(new URL('/pricing', target).href)\` — page.goto() takes a STRING, so \`.href\` is MANDATORY (passing the URL object is the #1 script bug)
   - prefer role/text locators: \`page.getByRole('link', { name: 'Pricing' })\`
   - assert by throwing: \`if (!heading?.includes('Pricing')) throw new Error('expected Pricing, got ' + heading)\`
   - keep it under ~25 lines; it must complete in under 60s
2. FINDINGS —
   - kind "hard-failure": objective breakage only (console/page errors, HTTP >= 400 responses, crashes, blank pages). Include the exact error output in detail.
   - kind "advisory": your judgment on UX, accessibility, or speed. Be sparing; only what a developer would thank you for.

## Final message — STRICT
Reply with ONLY one JSON object, no prose, no markdown fences:
{
  "flows": [
    { "id": "kebab-case-id", "title": "Visitor does something meaningful", "script": "export default async function flow(page, target) { ... }" }
  ],
  "findings": [
    { "kind": "hard-failure", "title": "Short statement", "detail": "Exact evidence: error text, URL, HTTP status" }
  ]
}
Empty arrays are fine. An honest empty report beats an invented one.`;
}

/** Parse an explorer's final message. Exported for tests. */
export function parseExplorerReport(text: string): ExplorerReport | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const raw = parsed as { flows?: unknown; findings?: unknown };

  const flows: ProposedFlow[] = [];
  if (Array.isArray(raw.flows)) {
    for (const f of raw.flows as Array<Record<string, unknown>>) {
      const id = slugify(String(f?.id ?? f?.title ?? ''));
      const script = typeof f?.script === 'string' ? f.script : undefined;
      if (!id || !script || !script.includes('export default')) continue;
      if (looksDangerous(script)) {
        console.warn(`proposed flow "${id}" rejected: script uses a disallowed API (issue #3)`);
        continue;
      }
      flows.push({ id, title: String(f.title ?? id), script });
    }
  }
  const findings: ExplorerReport['findings'] = [];
  if (Array.isArray(raw.findings)) {
    for (const f of raw.findings as Array<Record<string, unknown>>) {
      if (typeof f?.title !== 'string') continue;
      findings.push({
        kind: f.kind === 'hard-failure' ? 'hard-failure' : 'advisory',
        title: f.title,
        detail: typeof f.detail === 'string' ? f.detail : '',
      });
    }
  }
  return { flows, findings };
}

/** Dedupe proposed flows against the map and each other. Exported for tests. */
export function collectProposedFlows(
  reports: Array<ExplorerReport | undefined>,
  knownFlows: FlowMeta[],
): ProposedFlow[] {
  const taken = new Set(knownFlows.map((f) => f.id));
  const out: ProposedFlow[] = [];
  for (const report of reports) {
    for (const flow of report?.flows ?? []) {
      if (taken.has(flow.id)) continue;
      taken.add(flow.id);
      out.push(flow);
    }
  }
  return out;
}

/**
 * Reject a proposed script that reaches for capabilities a Flow never needs
 * (issue #3). A Flow only drives the Playwright `page`; anything touching the
 * Node runtime, the environment, or dynamic module loading is a red flag —
 * either a bad generation or prompt-injected exfiltration. Cheap denylist,
 * defense-in-depth alongside `withoutSensitiveEnv`; not a substitute for a
 * real sandbox. Exported for tests.
 */
const DANGEROUS_SCRIPT_PATTERNS: RegExp[] = [
  /\bchild_process\b/,
  /\bnode:/,
  /\brequire\s*\(/,
  /\bimport\s*\(/,
  /\bprocess\s*\.\s*(env|exit|binding|kill|dlopen)/,
  /\beval\s*\(/,
  /\bglobalThis\b/,
  /\bFunction\s*\(/,
];

export function looksDangerous(script: string): boolean {
  return DANGEROUS_SCRIPT_PATTERNS.some((re) => re.test(script));
}

/** Kebab-case a title into a flow id. Exported for tests. */
export function slugify(value: string): string | undefined {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
