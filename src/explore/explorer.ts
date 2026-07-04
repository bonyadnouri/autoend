import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { extractJsonObject, runAgentJob } from '../agents/harness.js';
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
  /** Resolved once per Run (ADR-0009: strong model everywhere). */
  model: string;
  apiKey: string;
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

/**
 * A candidate Defect (ADR-0008): a suspected semantic bug an explorer could
 * not prove with an objective signal. It only becomes a Finding after the
 * Verifier reproduces it from these steps in a fresh session.
 */
export interface CandidateDefect {
  title: string;
  /** The behavior the app violated. */
  expectation: string;
  /** Where the expectation came from. */
  source: 'docs' | 'brief' | 'common-sense';
  /** Numbered repro steps a fresh session can follow verbatim. */
  repro: string[];
  /** Where the violation is observable. */
  url?: string;
}

export interface ExplorerReport {
  flows: ProposedFlow[];
  findings: Array<{ kind: 'hard-failure' | 'advisory'; title: string; detail: string }>;
  /** Deep path only (ADR-0007/0008); absent on smoke reports. */
  candidates?: CandidateDefect[];
  leads?: Array<{ hint: string; url?: string }>;
}

/** Each smoke explorer gets a distinct lens so the fleet doesn't converge on one path. */
const LENSES = [
  'Walk the primary user journey end to end, starting from the landing page — the path a first-time visitor is meant to take.',
  'Exercise forms and inputs: search, signup, login, contact. Fill them with plausible test data and submit.',
  'Explore navigation: menus, headers, footers, secondary pages. Verify links lead somewhere real.',
  'Probe edge behavior: empty states, browser back/forward, repeating an action twice, unusual but legitimate input.',
];

/**
 * Extra wall-clock the hard stop allows past the soft deadline given to
 * agents. Live-run data: explorers on a multi-page target need 60-100s wall
 * clock at low effort (5-15s/turn) — a tight grace starves them right before
 * they report, losing all their work.
 */
export const GRACE_MS = 60_000;

/**
 * The smoke path (ADR-0007): low/mid Effort keeps the fast single-pass
 * explorer fleet (ADR-0001/0003) — Cursor local agents holding the
 * agent-browser CLI through the SDK's shell tool, each in an isolated browser
 * session, time-boxed by the Effort budget. Flows they propose only enter the
 * Flow Map after verify-by-running via the replay engine (ADR-0002).
 */
export async function explore(opts: ExploreOptions): Promise<ExplorationResult> {
  const workDir = join(opts.runDir, 'explore');
  await mkdir(workDir, { recursive: true });

  const reports = await Promise.all(
    Array.from({ length: opts.budget.explorers }, (_, i) =>
      runExplorer({
        name: `autoend-explorer-${i}`,
        session: `autoend-x${i}`,
        prompt: smokePrompt(i, `autoend-x${i}`, opts),
        workDir,
        budgetSeconds: opts.budget.seconds,
        model: opts.model,
        apiKey: opts.apiKey,
      }),
    ),
  );

  const findings = await collectReportedFindings(reports, (i) => `explore-${i}`, opts.evidenceDir);
  const proposed = collectProposedFlows(reports, opts.knownFlows);
  const flowSnapshots = await admitProposedFlows(proposed, opts, workDir);
  return { discovered: flowSnapshots.length, findings, flows: flowSnapshots };
}

export interface ExplorerJob {
  name: string;
  session: string;
  prompt: string;
  workDir: string;
  budgetSeconds: number;
  model: string;
  apiKey: string;
}

/** Run one explorer to completion and parse its report. Shared by smoke and deep waves. */
export async function runExplorer(job: ExplorerJob): Promise<ExplorerReport | undefined> {
  try {
    const text = await runAgentJob({
      name: job.name,
      prompt: job.prompt,
      cwd: job.workDir,
      model: job.model,
      apiKey: job.apiKey,
      timeoutMs: job.budgetSeconds * 1000 + GRACE_MS,
    });
    if (text === undefined) return undefined;
    const report = parseExplorerReport(text);
    if (!report) console.warn(`${job.name} returned an unparseable report`);
    return report;
  } finally {
    await closeSession(job.session);
  }
}

/**
 * Attach Evidence and collect the findings explorers reported directly.
 * `videoBase(i)` names explorer i's recording within evidenceDir.
 */
export async function collectReportedFindings(
  reports: Array<ExplorerReport | undefined>,
  videoBase: (index: number) => string,
  evidenceDir: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const [i, report] of reports.entries()) {
    if (!report) continue;
    const evidence = `${videoBase(i)}.webm`;
    const recorded = await access(join(evidenceDir, evidence)).then(
      () => true,
      () => false,
    );
    for (const [n, f] of report.findings.entries()) {
      findings.push({
        id: `${videoBase(i)}-${n}`,
        kind: f.kind,
        title: f.title,
        detail: f.detail,
        evidence: recorded ? evidence : undefined,
      });
    }
  }
  return findings;
}

/**
 * Verify-by-running (ADR-0002): execute each proposed Flow script; only ones
 * that pass enter the Flow Map. Scripts are LLM-authored and run in-process,
 * so secrets are hidden for the duration (issue #3).
 */
export async function admitProposedFlows(
  proposed: ProposedFlow[],
  opts: Pick<ExploreOptions, 'repoRoot' | 'target' | 'evidenceDir'>,
  workDir: string,
): Promise<FlowSnapshot[]> {
  const flowSnapshots: FlowSnapshot[] = [];
  if (proposed.length === 0) return flowSnapshots;
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
  return flowSnapshots;
}

/**
 * Prompt fragments shared by the smoke and persona (deep) explorers, so the
 * browser protocol, safety fences, and output contract never drift apart.
 */
export function browserProtocol(session: string, target: URL, videoPath: string): string {
  return `## Your browser
Drive the browser with the agent-browser CLI via shell. EVERY command MUST include \`--session ${session}\` (other agents share the daemon; the flag isolates your browser).

SPEED MATTERS: every shell call costs you a turn. BATCH commands whenever possible.

Protocol — first shell call (one batch):
  agent-browser --session ${session} batch "open ${target.href}" "record start ${videoPath}" "snapshot -i -c"
Work loop (batch an action with the checks that follow it):
  agent-browser --session ${session} batch "click @e12" "get url" "snapshot -i -c" "console" "errors"
  agent-browser --session ${session} batch "fill @e5 test@example.com" "click @e7" "snapshot -i -c"
Protocol — last shell call (NEVER skip, even when out of time):
  agent-browser --session ${session} batch "record stop" "close"`;
}

export function hardRules(origin: string): string {
  return `## Hard rules
- NEVER navigate off the origin ${origin} — if a click leaves it, go back immediately.
- Avoid destructive or irreversible actions (deleting data, real purchases, sending messages to third parties) unless a flow cannot be completed otherwise.
- Do not read or modify files outside your working directory. Your only tools are agent-browser and trivial shell.`;
}

export function flowScriptRules(knownFlows: FlowMeta[]): string {
  const known =
    knownFlows.length > 0
      ? knownFlows.map((f) => `- ${f.title}`).join('\n')
      : '(none yet — this is the first exploration of this app)';
  return `FLOWS — user-meaningful paths you verified work (e.g. "Visitor completes checkout"). Known flows, do NOT re-propose:
${known}
   For each NEW flow, write a Playwright script:
   - default-export \`async function flow(page, target)\` — no imports; use only the \`page\` (Playwright Page) and \`target\` (URL) arguments
   - navigate target-relative: \`await page.goto(new URL('/pricing', target).href)\` — page.goto() takes a STRING, so \`.href\` is MANDATORY (passing the URL object is the #1 script bug)
   - prefer role/text locators: \`page.getByRole('link', { name: 'Pricing' })\`
   - assert by throwing: \`if (!heading?.includes('Pricing')) throw new Error('expected Pricing, got ' + heading)\`
   - keep it under ~25 lines; it must complete in under 60s`;
}

function smokePrompt(index: number, session: string, opts: ExploreOptions): string {
  const { target, budget, evidenceDir, knownFlows } = opts;
  const videoPath = join(evidenceDir, `explore-${index}.webm`);

  return `You are autoend explorer #${index}, part of a fleet testing a web app end-to-end. You have ${budget.seconds} seconds of exploration; ${Math.round(GRACE_MS / 1000)}s after that deadline you are hard-killed and any unreported work is LOST — so report early rather than perfectly.

TARGET: ${target.href}
Your lens: ${LENSES[index % LENSES.length]}

${browserProtocol(session, target, videoPath)}

${hardRules(target.origin)}

## What to produce
1. ${flowScriptRules(knownFlows)}
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

/**
 * Parse an explorer's final message. Flow scripts are the fragile part of the
 * report — one bad escape inside a "script" string breaks JSON.parse for the
 * whole object — so when full parsing fails, salvage the non-script arrays
 * (findings, candidates, leads) rather than losing the explorer's entire work.
 * Exported for tests.
 */
export function parseExplorerReport(text: string): ExplorerReport | undefined {
  const raw = (extractJsonObject(text) ?? salvageReportArrays(text)) as
    | { flows?: unknown; findings?: unknown; candidates?: unknown; leads?: unknown }
    | undefined;
  if (!raw) return undefined;

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
  const candidates: CandidateDefect[] = [];
  if (Array.isArray(raw.candidates)) {
    for (const c of raw.candidates as Array<Record<string, unknown>>) {
      if (typeof c?.title !== 'string' || typeof c?.expectation !== 'string') continue;
      const repro = Array.isArray(c.repro)
        ? (c.repro as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
      if (repro.length === 0) continue; // unreproducible by construction — worthless to the Verifier
      candidates.push({
        title: c.title,
        expectation: c.expectation,
        source: c.source === 'docs' || c.source === 'brief' ? c.source : 'common-sense',
        repro,
        url: typeof c.url === 'string' ? c.url : undefined,
      });
    }
  }
  const leads: NonNullable<ExplorerReport['leads']> = [];
  if (Array.isArray(raw.leads)) {
    for (const l of raw.leads as Array<Record<string, unknown>>) {
      if (typeof l?.hint !== 'string' || l.hint.length === 0) continue;
      leads.push({ hint: l.hint, url: typeof l.url === 'string' ? l.url : undefined });
    }
  }
  return { flows, findings, candidates, leads };
}

/**
 * Last-resort recovery when the report object as a whole doesn't parse:
 * extract each non-script top-level array ("findings", "candidates", "leads")
 * by bracket-matching and parse it standalone. Flows are deliberately NOT
 * salvaged — their script strings are what broke the parse. Returns undefined
 * when nothing salvageable is found. Exported for tests.
 */
export function salvageReportArrays(
  text: string,
): { findings?: unknown; candidates?: unknown; leads?: unknown } | undefined {
  const out: Record<string, unknown> = {};
  for (const key of ['findings', 'candidates', 'leads'] as const) {
    const label = `"${key}"`;
    const at = text.indexOf(label);
    if (at < 0) continue;
    const open = text.indexOf('[', at + label.length);
    if (open < 0) continue;
    // Bracket-match while skipping string contents (escapes included).
    let depth = 0;
    let inString = false;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '[') depth++;
      else if (ch === ']' && --depth === 0) {
        try {
          out[key] = JSON.parse(text.slice(open, i + 1));
        } catch {
          // this array is broken too — skip it
        }
        break;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
