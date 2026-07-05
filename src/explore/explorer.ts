import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { extractJsonObject, runAgentJob, type AgentRuntime } from '../agents/harness.js';
import { addFlow, type FlowMeta } from '../map/flow-map.js';
import { runFlowScript } from '../replay/replay.js';
import type { RunReporter, ScreenElement } from '../stream/index.js';
import { screenId, screenTitle } from '../stream/screen-id.js';
import type { ExplorationBudget } from '../run/effort.js';
import type { Finding, FlowSnapshot } from '../report/types.js';
import { withoutSensitiveEnv } from '../run/sensitive-env.js';
import { closeSession } from './hands.js';

/**
 * Everything a cloud explorer needs to push its recording to Supabase Storage
 * from inside its Linux VM (the WebM never touches the host, so the agent must
 * upload it and hand back the public URL).
 */
export interface EvidenceUpload {
  supabaseUrl: string;
  /** anon (or service-role) key — the evidence bucket is public with open RLS. */
  key: string;
  bucket: string;
  runId: string;
}

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
  reporter?: RunReporter;
  /** Where explorers run: 'local' (default) or 'cloud' (Cursor Linux VM). */
  runtime?: AgentRuntime;
  /** Repo a cloud explorer clones; ignored for local runtime. */
  cloudRepo?: string;
  /** Cloud runtime only: lets remote explorers upload their recording. */
  evidenceUpload?: EvidenceUpload;
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

/** Per-screen structure an explorer captured from its `snapshot -i -c` output. */
export interface ReportedScreen {
  path: string;
  elements: Array<{ label: string; kind: string }>;
  navigation: Array<{ label: string; target: string; trigger?: string }>;
}

export interface ExplorerReport {
  flows: ProposedFlow[];
  findings: Array<{ kind: 'hard-failure' | 'advisory'; title: string; detail: string }>;
  /** Interactive elements + navigation per screen the explorer visited. */
  screens?: ReportedScreen[];
  /** Deep path only (ADR-0007/0008); absent on smoke reports. */
  candidates?: CandidateDefect[];
  leads?: Array<{ hint: string; url?: string }>;
  /** Cloud runtime: public URL of the recording the agent uploaded itself. */
  evidenceUrl?: string;
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
 * Extra wall-clock a cloud explorer gets on top of its Effort budget: a fresh
 * Cursor VM must `npm install -g agent-browser` and download Chromium before it
 * can touch the Target, and that one-time setup would otherwise eat the whole
 * exploration budget. Local runtime already has the tools, so it gets nothing.
 */
export const CLOUD_SETUP_MS = 150_000;

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
        runtime: opts.runtime,
        cloudRepo: opts.cloudRepo,
      }),
    ),
  );

  const findings = await collectReportedFindings(reports, (i) => `explore-${i}`, opts.evidenceDir);
  // Enrich screens with captured structure before admitting flows, so a bad-end
  // flow can still settle its last screen 'failed' afterwards (status wins).
  await emitReportedScreens(reports, opts);
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
  runtime?: AgentRuntime;
  cloudRepo?: string;
}

/** Run one explorer to completion and parse its report. Shared by smoke and deep waves. */
export async function runExplorer(job: ExplorerJob): Promise<ExplorerReport | undefined> {
  const cloud = job.runtime === 'cloud';
  try {
    const text = await runAgentJob({
      name: job.name,
      prompt: job.prompt,
      cwd: job.workDir,
      model: job.model,
      apiKey: job.apiKey,
      // Cloud VMs pay a one-time tool-install tax before exploring (CLOUD_SETUP_MS).
      timeoutMs: job.budgetSeconds * 1000 + GRACE_MS + (cloud ? CLOUD_SETUP_MS : 0),
      runtime: job.runtime,
      cloudRepo: job.cloudRepo,
    });
    if (text === undefined) return undefined;
    const report = parseExplorerReport(text);
    if (!report) console.warn(`${job.name} returned an unparseable report`);
    return report;
  } finally {
    // A cloud explorer's browser lives and dies inside its VM — there is no
    // local agent-browser daemon to close (calling it would fail on the host).
    if (!cloud) await closeSession(job.session);
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
    // Cloud explorers upload their own recording and report its public URL;
    // local explorers drop a WebM in evidenceDir that publish uploads later.
    let evidence: string | undefined;
    if (report.evidenceUrl) {
      evidence = report.evidenceUrl;
    } else {
      const file = `${videoBase(i)}.webm`;
      const recorded = await access(join(evidenceDir, file)).then(
        () => true,
        () => false,
      );
      evidence = recorded ? file : undefined;
    }
    for (const [n, f] of report.findings.entries()) {
      findings.push({
        id: `${videoBase(i)}-${n}`,
        kind: f.kind,
        title: f.title,
        detail: f.detail,
        evidence,
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
  opts: Pick<ExploreOptions, 'repoRoot' | 'target' | 'evidenceDir' | 'reporter'>,
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
        const outcome = await runFlowScript(browser, scriptPath, opts.target, opts.evidenceDir, `discovered-${flow.id}`, {
          reporter: opts.reporter,
          flowId: flow.id,
          flowTitle: flow.title,
          discover: true,
        });
        if (outcome.ok) {
          const now = new Date().toISOString();
          // A flow that ran clean but ended on an HTTP error page is a broken
          // path, not a verified one: keep it OUT of the Flow Map (we never want
          // to replay a known-bad path as if it were a working flow). The 404
          // destination itself is already dropped by runFlowScript, so every id
          // left in visitedScreenIds is a real page — emit them all as discovered.
          const badEnd = outcome.badEndState;
          const ids = outcome.visitedScreenIds;
          for (const id of ids) {
            await opts.reporter?.screenSeen({ id, path: id, status: 'discovered' });
          }
          if (!badEnd) {
            await addFlow(opts.repoRoot, { id: flow.id, title: flow.title, discoveredAt: now, lastPassedAt: now }, flow.script);
          } else {
            console.warn(`discovered flow "${flow.id}" ends on an error page (${badEnd}); recorded as failed`);
          }
          flowSnapshots.push({
            id: flow.id,
            title: flow.title,
            status: badEnd ? 'failed' : 'discovered',
            discoveredAt: now,
            lastPassedAt: badEnd ? undefined : now,
            timeline: outcome.timeline,
            evidence: outcome.evidence,
            durationMs: outcome.durationMs,
            console: outcome.console,
            network: outcome.network,
            script: flow.script,
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
export function browserProtocol(session: string, target: URL, _videoPath?: string): string {
  return `## Your browser
Drive the browser with the agent-browser CLI via shell. EVERY command MUST include \`--session ${session}\` (other agents share the daemon; the flag isolates your browser).

SPEED MATTERS: every shell call costs you a turn. BATCH commands whenever possible.

Protocol — first shell call (one batch):
  agent-browser --session ${session} batch "open ${target.href}" "snapshot -i -c"
Work loop (batch an action with the checks that follow it):
  agent-browser --session ${session} batch "click @e12" "get url" "snapshot -i -c" "console" "errors"
  agent-browser --session ${session} batch "fill @e5 test@example.com" "click @e7" "snapshot -i -c"
Protocol — last shell call (NEVER skip, even when out of time):
  agent-browser --session ${session} batch "close"`;
}

/**
 * Cloud-runtime browser protocol: the explorer runs in a fresh Cursor Linux
 * VM, so it must install agent-browser + Chromium itself, record its whole run
 * (recording works reliably on Linux, unlike the host), then upload the WebM to
 * Supabase Storage and hand back the public URL as `evidenceUrl`.
 */
export function cloudBrowserProtocol(session: string, target: URL, upload: EvidenceUpload, videoBase: string): string {
  const remoteVideo = `/tmp/${videoBase}.webm`;
  const objectPath = `${upload.runId}/${videoBase}.webm`;
  const publicUrl = `${upload.supabaseUrl}/storage/v1/object/public/${upload.bucket}/${objectPath}`;
  return `## Your browser (cloud Linux VM)
You are in a fresh Cursor cloud VM. Do this ONE-TIME SETUP first, in order:
  npm install -g agent-browser
  agent-browser install            # downloads Chromium; may take ~60s
If a step reports the tool/browser is already present, move on.

Drive the browser with the agent-browser CLI via shell. EVERY command MUST include \`--session ${session}\`.
SPEED MATTERS: every shell call costs a turn. BATCH commands whenever possible.

Protocol — first browser call (start recording so your run is captured):
  agent-browser --session ${session} batch "record start ${remoteVideo}" "open ${target.href}" "snapshot -i -c"
Work loop (batch an action with the checks that follow it):
  agent-browser --session ${session} batch "click @e12" "get url" "snapshot -i -c" "console" "errors"
Protocol — last browser call (NEVER skip, even when out of time):
  agent-browser --session ${session} batch "record stop" "close"

## Upload your recording — MANDATORY (run after "record stop")
  curl -sS -X POST "${upload.supabaseUrl}/storage/v1/object/${upload.bucket}/${objectPath}" \\
    -H "Authorization: Bearer ${upload.key}" -H "apikey: ${upload.key}" \\
    -H "Content-Type: video/webm" -H "x-upsert: true" \\
    --data-binary "@${remoteVideo}"
On success the recording is served at this exact URL:
  ${publicUrl}
Put that URL in your final JSON as "evidenceUrl" (or null if the upload failed).`;
}

/** Pick the browser protocol for the runtime: cloud VM vs local host. */
export function explorerBrowserProtocol(opts: ExploreOptions, session: string, videoBase: string): string {
  if (opts.runtime === 'cloud' && opts.evidenceUpload) {
    return cloudBrowserProtocol(session, opts.target, opts.evidenceUpload, videoBase);
  }
  return browserProtocol(session, opts.target, join(opts.evidenceDir, `${videoBase}.webm`));
}

export function hardRules(origin: string): string {
  return `## Hard rules
- NEVER navigate off the origin ${origin} — if a click leaves it, go back immediately.
- Navigate LIKE A USER: start from the entry point and reach pages by CLICKING the links, buttons, and controls that ACTUALLY EXIST in the page you are on (visible in your \`snapshot -i -c\`). Traverse only what the UI offers.
- BROKEN LINK = ERROR: if you CLICK a link/button that exists and it lands on a 404 or error page, the app offered navigation that is dead — report it as a kind "hard-failure" finding (include the control's text, the URL, and the HTTP status).
- EXPECTED-BUT-MISSING = WARNING: do NOT guess or type random URLs. The ONLY exception: when you reasonably expect a standard page to exist (e.g. a site with a login link ought to have a signup page) but NO control on the UI links to it, you may try that ONE URL directly — and if it 404s, report it as a kind "advisory" finding (e.g. "Expected page \\"/signup\\" but it was not present (HTTP 404)"), a warning, not an error.
- In EITHER case a page whose document responded HTTP >= 400 is NEVER a screen. Only pages that actually loaded (HTTP < 400) go under "screens".
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

/**
 * Instructs explorers to report each page's structure. Shared by smoke and
 * persona prompts so the SCREENS contract never drifts between them.
 */
export function screenCaptureRules(): string {
  return `SCREENS — for every distinct page that ACTUALLY LOADED (HTTP < 400; a real page, not a 404/error), record its structure from your \`snapshot -i -c\` output:
   - "elements": the interactive controls on the page — each { "label": visible text/aria, "kind": one of button|link|input|checkbox|dropdown|form|text }
   - "navigation": the controls that take the user to another page — each { "label": the control's text, "target": the destination path e.g. "/settings", "trigger": usually "click" }
   Report the real page path (e.g. "/login", "/projects/alpha"). Do NOT include pages that 404 or error — those go under FINDINGS as "advisory" (expected-but-missing), never here. Missing data → empty arrays.`;
}

/** JSON fragment appended to a prompt's output contract for the screens array. */
const SCREENS_CONTRACT = `,
  "screens": [
    { "path": "/login", "elements": [ { "label": "Sign in", "kind": "button" } ], "navigation": [ { "label": "Sign up", "target": "/signup", "trigger": "click" } ] }
  ]`;

/** Map a free-form element kind an explorer reported to Lumen's ElementType. */
export function mapElementType(kind: string): string {
  const k = kind.toLowerCase().trim();
  if (k === 'button' || k === 'submit') return 'button';
  if (k === 'link' || k === 'a' || k === 'anchor') return 'link';
  if (k === 'input' || k === 'textbox' || k === 'textarea' || k === 'search') return 'input';
  if (k === 'form') return 'form';
  if (k === 'image' || k === 'img') return 'image';
  if (k === 'dropdown' || k === 'select' || k === 'combobox' || k === 'menu') return 'dropdown';
  if (k === 'checkbox' || k === 'radio' || k === 'switch' || k === 'toggle') return 'checkbox';
  return 'text';
}

/** Human-readable expected actions synthesized from a screen's elements. */
function deriveExpectedActions(elements: ScreenElement[]): string[] {
  const actions: string[] = [];
  for (const el of elements) {
    if (el.type === 'button' || el.type === 'link') actions.push(`Click "${el.label}"`);
    else if (el.type === 'input') actions.push(`Enter "${el.label}"`);
    else if (el.type === 'checkbox' || el.type === 'dropdown') actions.push(`Set "${el.label}"`);
    else if (el.type === 'form') actions.push(`Submit ${el.label}`);
  }
  return actions.slice(0, 8);
}

/** Resolve an explorer-reported path/URL to the same stable id the DB uses. */
function toScreenId(pathOrUrl: string, target: URL): string {
  try {
    return screenId(new URL(pathOrUrl, target).href);
  } catch {
    return '/';
  }
}

/**
 * Stream the per-screen structure explorers reported into the screens table as
 * enrichment (elements/navigation/expected actions), leaving status untouched
 * so a flow's settled status is never downgraded. Best-effort; never throws.
 */
export async function emitReportedScreens(
  reports: Array<ExplorerReport | undefined>,
  opts: Pick<ExploreOptions, 'reporter' | 'target'>,
): Promise<void> {
  const reporter = opts.reporter;
  if (!reporter) return;
  for (const report of reports) {
    for (const s of report?.screens ?? []) {
      const id = toScreenId(s.path, opts.target);
      const elements: ScreenElement[] = s.elements.map((e, i) => ({
        id: `${id}-el-${i}`,
        label: e.label,
        type: mapElementType(e.kind),
        description: '',
      }));
      const navigation = s.navigation.map((n) => ({
        label: n.label,
        targetScreenId: toScreenId(n.target, opts.target),
        trigger: n.trigger || 'click',
      }));
      await reporter.screenSeen({
        id,
        path: id,
        title: screenTitle(id),
        elements,
        navigation,
        expectedActions: deriveExpectedActions(elements),
        // Enrichment only: never conjure a screen node from the agent's word. A
        // real screen already exists because a verified flow navigated to it and
        // got HTTP < 400; a guessed/404 path has no row and stays off the graph.
        enrichOnly: true,
      });
    }
  }
}

function smokePrompt(index: number, session: string, opts: ExploreOptions): string {
  const { target, budget, knownFlows } = opts;
  const cloud = opts.runtime === 'cloud' && Boolean(opts.evidenceUpload);
  const evidenceField = cloud
    ? ',\n  "evidenceUrl": "https://.../evidence/....webm or null"'
    : '';

  return `You are autoend explorer #${index}, part of a fleet testing a web app end-to-end. You have ${budget.seconds} seconds of exploration; ${Math.round(GRACE_MS / 1000)}s after that deadline you are hard-killed and any unreported work is LOST — so report early rather than perfectly.

TARGET: ${target.href}
Your lens: ${LENSES[index % LENSES.length]}

${explorerBrowserProtocol(opts, session, `explore-${index}`)}

${hardRules(target.origin)}

## What to produce
1. ${flowScriptRules(knownFlows)}
2. FINDINGS —
   - kind "hard-failure": objective breakage — a link/button you CLICKED that leads to a 404/error page (a broken link), HTTP 5xx, console/page errors, crashes, blank pages. Include the exact control text, URL, and HTTP status.
   - kind "advisory": (a) an expected-but-missing page — a standard page you expected that had NO control linking to it, so you tried its URL directly and got a 404 — titled like "Expected page \\"/signup\\" but it was not present (HTTP 404)"; and (b) your judgment on UX, accessibility, or speed. Be sparing; only what a developer would thank you for.
3. ${screenCaptureRules()}

## Final message — STRICT
Reply with ONLY one JSON object, no prose, no markdown fences:
{
  "flows": [
    { "id": "kebab-case-id", "title": "Visitor does something meaningful", "script": "export default async function flow(page, target) { ... }" }
  ],
  "findings": [
    { "kind": "hard-failure", "title": "Short statement", "detail": "Exact evidence: error text, URL, HTTP status" }
  ]${SCREENS_CONTRACT}${evidenceField}
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
    | { flows?: unknown; findings?: unknown; screens?: unknown; candidates?: unknown; leads?: unknown; evidenceUrl?: unknown }
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
  const screens: ReportedScreen[] = [];
  if (Array.isArray(raw.screens)) {
    for (const s of raw.screens as Array<Record<string, unknown>>) {
      if (typeof s?.path !== 'string') continue;
      const elements = Array.isArray(s.elements)
        ? (s.elements as Array<Record<string, unknown>>)
            .filter((e) => e && typeof e.label === 'string')
            .map((e) => ({ label: String(e.label), kind: typeof e.kind === 'string' ? e.kind : 'text' }))
        : [];
      const navigation = Array.isArray(s.navigation)
        ? (s.navigation as Array<Record<string, unknown>>)
            .filter((n) => n && typeof n.label === 'string')
            .map((n) => ({
              label: String(n.label),
              target: typeof n.target === 'string' ? n.target : typeof n.targetScreenId === 'string' ? n.targetScreenId : '',
              trigger: typeof n.trigger === 'string' ? n.trigger : 'click',
            }))
        : [];
      screens.push({ path: s.path, elements, navigation });
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
  const evidenceUrl =
    typeof raw.evidenceUrl === 'string' && /^https?:\/\//.test(raw.evidenceUrl) ? raw.evidenceUrl : undefined;
  return { flows, findings, screens, candidates, leads, evidenceUrl };
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
): { findings?: unknown; screens?: unknown; candidates?: unknown; leads?: unknown } | undefined {
  const out: Record<string, unknown> = {};
  for (const key of ['findings', 'screens', 'candidates', 'leads'] as const) {
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
