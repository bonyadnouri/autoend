import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineShape } from '../run/effort.js';
import type { ProductBrief } from '../recon/brief.js';
import {
  admitProposedFlows,
  collectProposedFlows,
  collectReportedFindings,
  emitReportedScreens,
  explorerBrowserProtocol,
  flowScriptRules,
  hardRules,
  runExplorer,
  screenCaptureRules,
  GRACE_MS,
  type CandidateDefect,
  type ExploreOptions,
  type ExplorerReport,
} from './explorer.js';
import { dedupeLeads, loadLeads, makeLead, saveLeads, takeLeads, type Lead } from './leads.js';
import { ARCHETYPE_PROFILES, assignMissions, type PersonaAssignment } from './personas.js';
import type { Finding, FlowSnapshot } from '../report/types.js';

/**
 * The deep exploration path (ADR-0007): persona Waves instead of lens
 * explorers. Wave one runs Recon-assigned Missions; Wave two (xhigh/ultra)
 * chases the best Leads. Candidates for semantic Defects come back for the
 * Verifier (ADR-0008); Leads that no Wave consumed persist in the ledger and
 * seed the next Run.
 */

export interface DeepExploreOptions extends ExploreOptions {
  shape: PipelineShape;
  brief?: ProductBrief;
}

export interface DeepExplorationResult {
  discovered: number;
  findings: Finding[];
  flows: FlowSnapshot[];
  /** For the Verifier stage (ADR-0008). */
  candidates: CandidateDefect[];
}

/** Leads each Wave-two explorer chases; more dilutes focus, fewer wastes the fleet. */
const LEADS_PER_EXPLORER = 2;
/** Leads one explorer may bank per report — anti-spam, matched in the prompt. */
const MAX_LEADS_PER_REPORT = 5;

export async function exploreDeep(opts: DeepExploreOptions): Promise<DeepExplorationResult> {
  const workDir = join(opts.runDir, 'explore');
  await mkdir(workDir, { recursive: true });

  const ledger = await loadLeads(opts.repoRoot);
  const assignments = assignMissions(opts.brief?.missions, opts.shape.explorers);

  // Wave one always carries the ledger's Leads: ADR-0007 promises the ledger
  // "seeds the next Run's Missions", and Missions run in wave one — deferring
  // the ledger to wave two would let fresh Leads starve it forever.
  const { taken: carriedLeads, rest: ledgerRest } = takeLeads(
    ledger,
    opts.shape.explorers * LEADS_PER_EXPLORER,
  );
  const waveOne = await runWave(1, assignments, carriedLeads, workDir, opts);
  const findings = await collectReportedFindings(waveOne.reports, (i) => `explore-w1x${i}`, opts.evidenceDir);

  let reports = waveOne.reports;
  let unconsumed = [...ledgerRest];
  const freshLeads = waveOne.leads;

  if (opts.shape.waves === 2) {
    // Wave two: fresh personas seeded with the warmest Leads — wave one's
    // first, then the ledger's (takeLeads picks from the end of the array).
    const { taken: seeds, rest } = takeLeads(
      [...unconsumed, ...freshLeads],
      opts.shape.explorers * LEADS_PER_EXPLORER,
    );
    unconsumed = rest;
    if (seeds.length > 0) {
      // Size wave two to its seeds: a seedless persona would just re-run its
      // wave-one Mission verbatim — expensive duplication, not depth.
      const chasers = Math.min(opts.shape.explorers, Math.ceil(seeds.length / LEADS_PER_EXPLORER));
      const waveTwo = await runWave(2, assignMissions(opts.brief?.missions, chasers), seeds, workDir, opts);
      reports = [...reports, ...waveTwo.reports];
      findings.push(
        ...(await collectReportedFindings(waveTwo.reports, (i) => `explore-w2x${i}`, opts.evidenceDir)),
      );
      unconsumed = [...unconsumed, ...waveTwo.leads];
    } else {
      console.warn('wave two skipped: no leads to chase');
    }
  } else {
    unconsumed = [...unconsumed, ...freshLeads];
  }

  await saveLeads(opts.repoRoot, dedupeLeads(unconsumed));

  await emitReportedScreens(reports, opts);
  const proposed = collectProposedFlows(reports, opts.knownFlows);
  const flows = await admitProposedFlows(proposed, opts, workDir);
  const candidates = dedupeCandidates(reports.flatMap((r) => r?.candidates ?? []));

  return { discovered: flows.length, findings, flows, candidates };
}

interface WaveOutcome {
  reports: Array<ExplorerReport | undefined>;
  /** Fresh Leads this Wave banked. */
  leads: Lead[];
}

async function runWave(
  wave: 1 | 2,
  assignments: PersonaAssignment[],
  seeds: Lead[],
  workDir: string,
  opts: DeepExploreOptions,
): Promise<WaveOutcome> {
  const reports = await Promise.all(
    assignments.map((assignment, i) => {
      const session = `autoend-w${wave}x${i}`;
      const seedSlice = seeds.filter((_, n) => n % assignments.length === i);
      return runExplorer({
        name: `autoend-${assignment.archetype}-w${wave}-${i}`,
        session,
        prompt: personaPrompt({ wave, index: i, session, assignment, seeds: seedSlice, opts }),
        workDir,
        budgetSeconds: opts.shape.seconds,
        model: opts.model,
        apiKey: opts.apiKey,
        runtime: opts.runtime,
        cloudRepo: opts.cloudRepo,
      });
    }),
  );

  const leads: Lead[] = [];
  for (const [i, report] of reports.entries()) {
    for (const l of (report?.leads ?? []).slice(0, MAX_LEADS_PER_REPORT)) {
      leads.push(makeLead(l.hint, `${assignments[i]?.archetype ?? 'explorer'} w${wave}`, l.url));
    }
  }
  return { reports, leads };
}

/** Same title from two personas is one candidate; the Verifier re-runs it once. */
export function dedupeCandidates(candidates: CandidateDefect[]): CandidateDefect[] {
  const seen = new Map<string, CandidateDefect>();
  for (const c of candidates) {
    const key = c.title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

function personaPrompt(args: {
  wave: 1 | 2;
  index: number;
  session: string;
  assignment: PersonaAssignment;
  seeds: Lead[];
  opts: DeepExploreOptions;
}): string {
  const { wave, index, session, assignment, seeds, opts } = args;
  const { target, knownFlows, brief, shape } = opts;
  const videoBase = `explore-w${wave}x${index}`;
  const cloud = opts.runtime === 'cloud' && Boolean(opts.evidenceUpload);
  const { mission } = assignment;

  const productContext = brief
    ? `## The product (from reconnaissance of its codebase)
${brief.product}
Users: ${brief.users}
Surfaces: ${brief.surfaces.join(' · ')}`
    : '## The product\nNo reconnaissance brief is available — orient yourself quickly from the landing page.';

  const leadBlock =
    seeds.length > 0
      ? `## Leads to chase FIRST
Earlier explorers flagged these as suspicious or unexplored. Confirm, refute, or dig deeper before your own mission:
${seeds.map((l) => `- ${l.hint}${l.url ? ` (start at ${l.url})` : ''}`).join('\n')}`
      : '';

  return `You are an autoend persona explorer (wave ${wave}), testing a web app end-to-end IN CHARACTER. You have ${shape.seconds} seconds; ${Math.round(GRACE_MS / 1000)}s after that deadline you are hard-killed. Depth beats breadth: it is better to fully run one non-trivial scenario than to skim five pages. When time runs short, bank a LEAD instead of rushing a conclusion — an honest lead is valuable, a rushed claim is poison.

TARGET: ${target.href}

## Who you are
${ARCHETYPE_PROFILES[assignment.archetype]}

## Your Mission (yours alone — other personas own other surfaces)
Goal: ${mission.goal}
Surface: ${mission.surface}
Hypotheses worth probing:
${mission.hypotheses.map((h) => `- ${h}`).join('\n') || '- (none — follow your character)'}

${productContext}

${leadBlock}

${explorerBrowserProtocol(opts, session, videoBase)}

${hardRules(target.origin)}

## What to produce
1. ${flowScriptRules(knownFlows)}
2. FINDINGS —
   - kind "hard-failure": objective breakage — a link/button you CLICKED that leads to a 404/error page (a broken link), HTTP 5xx, console/page errors, crashes, blank pages. Include the exact control text, URL, and HTTP status.
   - kind "advisory": (a) an expected-but-missing page — a standard page you expected that had NO control linking to it, so you tried its URL directly and got a 404 — titled like "Expected page \\"/signup\\" but it was not present (HTTP 404)"; and (b) your judgment on UX, accessibility, or speed. Be sparing; only what a developer would thank you for.
3. ${screenCaptureRules()}
4. CANDIDATES — suspected SEMANTIC bugs: the page renders and returns 200, but the behavior is wrong (wrong data, wrong order, lost state, a control that does nothing). Do NOT file these as findings — an independent Verifier will re-execute your repro in a fresh browser session, and only reproduced candidates reach the user. Each candidate needs:
   - "expectation": the behavior the app violated, and "source": where that expectation comes from — "docs" (the product's own docs), "brief" (the reconnaissance above), or "common-sense"
   - "repro": numbered steps a FRESH session can follow verbatim, starting from ${target.href} (include exact inputs and what to observe)
5. LEADS — at most ${MAX_LEADS_PER_REPORT}: suspicious-but-unconfirmed observations, or territory you noticed but could not chase. A later wave (or the next Run) picks these up; they outlive you.

## Final message — STRICT
Reply with ONLY one JSON object, no prose, no markdown fences:
{
  "flows": [ { "id": "kebab-case-id", "title": "...", "script": "export default async function flow(page, target) { ... }" } ],
  "findings": [ { "kind": "hard-failure", "title": "...", "detail": "exact evidence" } ],
  "screens": [ { "path": "/login", "elements": [ { "label": "Sign in", "kind": "button" } ], "navigation": [ { "label": "Sign up", "target": "/signup", "trigger": "click" } ] } ],
  "candidates": [ { "title": "...", "expectation": "...", "source": "docs|brief|common-sense", "repro": ["1. ...", "2. ..."], "url": "where it is observable" } ],
  "leads": [ { "hint": "...", "url": "..." } ]${cloud ? ',\n  "evidenceUrl": "https://.../evidence/....webm or null"' : ''}
}
Empty arrays are fine. An honest empty report beats an invented one.`;
}
