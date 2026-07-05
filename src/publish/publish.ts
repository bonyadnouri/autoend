import { basename } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConsoleEntry, Finding, FlowSnapshot, NetworkEntry, RunArtifact, StepResult } from '../report/types.js';
import { screenId, screenTitle } from '../stream/screen-id.js';
import { uploadEvidence } from './evidence.js';
import { ANALYSIS_ID, getSupabase } from './supabase-client.js';

export interface PublishResult {
  skipped: boolean;
  tests: number;
  issues: number;
  investigations: number;
}

/** Row shapes mirror the Lumen Supabase schema (see 001_schema.sql / dbMappers.ts). */
interface TestRow {
  id: string;
  analysis_id: string;
  name: string;
  journey_id: string;
  screen_ids: string[];
  preconditions: string[];
  steps: Array<{ action: string; expected: string }>;
  expected_result: string;
  actual_result: string;
  status: 'pass' | 'fail' | 'warning' | 'not-executed';
  duration_ms: number;
  related_issue_ids: string[];
  has_investigation: boolean;
  /** Human-readable numbered reproduction recipe. */
  repro_steps: string[];
  /** Exact executable Playwright flow — the concrete reproduction. */
  script: string | null;
}

interface IssueRow {
  id: string;
  analysis_id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  related_screen_id: string;
  related_journey_id: string | null;
  suggested_fix: string;
  related_test_ids: string[];
  status: 'open';
}

interface JourneyRow {
  id: string;
  analysis_id: string;
  name: string;
  description: string;
  status: 'healthy' | 'warning' | 'broken';
  coverage: number;
  steps: Array<{ screenId: string; action: string }>;
  test_case_ids: string[];
}

interface InsightRow {
  id: string;
  analysis_id: string;
  title: string;
  category:
    | 'missing-functionality'
    | 'broken-flow'
    | 'ux-inconsistency'
    | 'unreachable-screen'
    | 'unexpected-navigation'
    | 'suggested-improvement';
  description: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  related_screen_id: string | null;
  related_journey_id: string | null;
  issue_id: string | null;
  /** Actionable next step for a developer — the "so what do I do" of an insight. */
  suggested_fix: string;
}

interface InvestigationRow {
  analysis_id: string;
  test_id: string;
  payload: unknown;
}

function testStatus(status: FlowSnapshot['status']): TestRow['status'] {
  if (status === 'failed') return 'fail';
  // 'passed' and 'discovered' both mean the flow was verified by running it
  // (a discovered flow only enters the map after admitProposedFlows passes it).
  return 'pass';
}

/**
 * The `tests` row a Finding hangs its Evidence off in the Lumen UI. Regressions
 * reuse their Flow's id (the flow is already a test); Findings with no Flow
 * (Defects, explorer hard-failures/advisories) fall back to their own id, and
 * get a synthetic test row so their video is reachable (issue -> test ->
 * investigation is the only path the UI renders video through).
 */
function subjectId(finding: Finding): string {
  return finding.flowId ?? finding.id;
}

/**
 * A Finding without a Flow becomes a synthetic test so its evidence is reachable.
 * Its status reflects severity, never execution: hard-failures/defects/regressions
 * are failures; advisories were still observed (they carry evidence), so they're
 * a 'warning', not 'not-executed'. 'not-executed' is reserved for tests that
 * genuinely never ran.
 */
function findingTestStatus(kind: Finding['kind']): TestRow['status'] {
  return kind === 'advisory' ? 'warning' : 'fail';
}

/** Turn a run timeline into a numbered, human-readable reproduction recipe. */
function reproSteps(timeline: StepResult[] | undefined): string[] {
  return (timeline ?? []).map((step, index) => `${index + 1}. ${step.label}`);
}

/** Best-effort screen id (path) embedded in a timeline label like "goto /login". */
function screenIdFromLabel(label: string): string {
  const match = /(\/[^\s]*)/.exec(label);
  return match ? match[1] : '';
}

/** A Flow's timeline as ordered Journey steps, each pinned to the screen it touched. */
function journeySteps(timeline: StepResult[] | undefined): JourneyRow['steps'] {
  return (timeline ?? []).map((step) => ({
    screenId: screenIdFromLabel(step.label),
    action: step.label,
  }));
}

/**
 * Every verified Flow is a user Journey in the UI: a named path through the app
 * with a coverage score and a back-reference to its test. Failed flows surface
 * as broken journeys so the graph shows where a path regressed. Journeys share
 * their Flow's id, which is exactly what each test's `journey_id` points at.
 */
function buildJourneys(artifact: RunArtifact): JourneyRow[] {
  return artifact.flows.map((flow) => ({
    id: flow.id,
    analysis_id: ANALYSIS_ID,
    name: flow.title,
    description:
      flow.status === 'discovered'
        ? 'Discovered during exploration'
        : flow.status === 'failed'
          ? 'Regressed during this run'
          : 'Verified user flow',
    status: flow.status === 'failed' ? 'broken' : 'healthy',
    coverage: flow.status === 'failed' ? 0 : 100,
    steps: journeySteps(flow.timeline),
    test_case_ids: [flow.id],
  }));
}

function severity(kind: Finding['kind']): IssueRow['severity'] {
  if (kind === 'hard-failure') return 'critical';
  // A defect is a Verifier-reproduced semantic bug (ADR-0008) — as actionable
  // as a regression, unlike judgment-tier advisories.
  if (kind === 'defect') return 'high';
  if (kind === 'regression') return 'high';
  return 'low';
}

function faultDomain(domain: string | undefined): string {
  switch (domain) {
    case 'app':
      return 'frontend';
    case 'environment':
      return 'network';
    case 'flow':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function evidenceLabel(label: string): string {
  if (label === 'before') return 'Before action';
  if (label === 'after') return 'After action';
  return 'At failure';
}

/** Map a captured console tier to the Lumen LogEntry level (types/index.ts). */
function logLevel(level: ConsoleEntry['level']): 'error' | 'warn' | 'info' | 'debug' {
  if (level === 'error') return 'error';
  if (level === 'warning') return 'warn';
  if (level === 'debug') return 'debug';
  return 'info';
}

/** Captured console entries → Lumen LogEntry rows (the investigation's Logs tab). */
function logRows(entries: ConsoleEntry[] | undefined): Array<Record<string, unknown>> {
  return (entries ?? []).map((entry, index) => ({
    id: `log-${index}`,
    level: logLevel(entry.level),
    source: 'console',
    tMs: entry.tMs,
    message: entry.text,
  }));
}

/** Captured endpoint requests → Lumen NetworkRequest rows (the Network tab). */
function networkRows(entries: NetworkEntry[] | undefined): Array<Record<string, unknown>> {
  return (entries ?? []).map((entry, index) => ({
    id: `net-${index}`,
    method: entry.method.toUpperCase(),
    endpoint: entry.url,
    status: entry.status,
    durationMs: entry.durationMs ?? 0,
    failed: entry.status === 0 || entry.status >= 400,
    tMs: entry.tMs,
  }));
}

function appName(target: string): string {
  try {
    return new URL(target).host;
  } catch {
    return target;
  }
}

/** Resolve an evidence filename (possibly a relative path) to its uploaded public URL. */
function evidenceUrl(urls: Map<string, string>, file: string | undefined): string | null {
  if (!file) return null;
  // Cloud explorers already uploaded their recording and reported a full URL.
  if (/^https?:\/\//.test(file)) return file;
  return urls.get(file) ?? urls.get(basename(file)) ?? null;
}

function buildTests(artifact: RunArtifact, investigatedIds: Set<string>): TestRow[] {
  const flowIds = new Set(artifact.flows.map((flow) => flow.id));
  const tests: TestRow[] = artifact.flows.map((flow) => {
    const related = artifact.findings.filter((f) => f.flowId === flow.id);
    return {
      id: flow.id,
      analysis_id: ANALYSIS_ID,
      name: flow.title,
      // Each Flow-backed test belongs to the Journey built from the same Flow.
      journey_id: flow.id,
      screen_ids: [],
      preconditions: [],
      steps: (flow.timeline ?? []).map((step) => ({
        action: step.label,
        expected: step.status === 'passed' ? 'Step succeeds' : 'Step fails',
      })),
      expected_result: 'Flow completes without regressions',
      actual_result:
        flow.status === 'failed'
          ? 'Flow failed during replay'
          : flow.status === 'discovered'
            ? 'Newly discovered flow'
            : 'Flow passed',
      status: testStatus(flow.status),
      duration_ms: flow.durationMs ?? 0,
      related_issue_ids: related.map((f) => f.id),
      has_investigation: investigatedIds.has(flow.id),
      repro_steps: reproSteps(flow.timeline),
      script: flow.script ?? null,
    };
  });

  // Synthetic test per Flow-less Finding that carries detail, so its Evidence
  // is reachable in the UI (issue -> related test -> investigation -> video).
  for (const finding of artifact.findings) {
    const sid = subjectId(finding);
    if (flowIds.has(sid) || !findingHasDetail(finding)) continue;
    tests.push({
      id: sid,
      analysis_id: ANALYSIS_ID,
      name: finding.title,
      journey_id: '',
      screen_ids: [],
      preconditions: [],
      steps: (finding.timeline ?? []).map((step) => ({
        action: step.label,
        expected: step.status === 'passed' ? 'Step succeeds' : 'Step fails',
      })),
      expected_result: finding.expectation?.statement ?? 'Behavior matches expectations',
      actual_result: finding.detail,
      status: findingTestStatus(finding.kind),
      duration_ms: 0,
      related_issue_ids: [finding.id],
      has_investigation: investigatedIds.has(sid),
      repro_steps: reproSteps(finding.timeline),
      script: null,
    });
  }
  return tests;
}

/** Map a Finding kind to the Lumen Insight taxonomy (types/index.ts). */
function insightCategory(kind: Finding['kind']): InsightRow['category'] {
  if (kind === 'hard-failure' || kind === 'regression') return 'broken-flow';
  if (kind === 'defect') return 'ux-inconsistency';
  return 'suggested-improvement';
}

/**
 * A concrete next step for the reader. Prefers an agent-provided fix (a
 * Diagnosis carries the filing agent's judgment); otherwise derives a sensible
 * default from the finding's kind/shape so every insight is actionable.
 */
function suggestedFix(finding: Finding): string {
  const agentFix = finding.diagnosis?.rootCause?.trim();
  if (agentFix) return agentFix;
  if (finding.title.startsWith('Expected page')) {
    return 'Create the missing page, or remove/redirect the link that points to it so users never hit a dead end.';
  }
  switch (finding.kind) {
    case 'regression':
      return 'Restore this flow: it worked before and fails now — review the recent change that broke this path.';
    case 'hard-failure':
      return 'Fix the server/page error surfaced in the logs and network panel before shipping.';
    case 'defect':
      return finding.expectation?.statement
        ? `Align the behavior with the expectation: ${finding.expectation.statement}`
        : 'Correct the behavior so it matches the documented/expected outcome.';
    default:
      return 'Review this observation and address it if it affects the user experience.';
  }
}

/**
 * Insights are the analysis-level readout the UI's Insights page renders. Each
 * Finding produces one, linked back to its Issue so a reader can pivot from the
 * high-level observation to the concrete issue and its investigation. Advisories
 * (which never became Issues) still surface here as improvement suggestions.
 */
function buildInsights(artifact: RunArtifact): InsightRow[] {
  return artifact.findings.map((finding) => ({
    id: `insight-${finding.id}`,
    analysis_id: ANALYSIS_ID,
    title: finding.title,
    category: insightCategory(finding.kind),
    description: finding.detail || finding.title,
    detail: finding.diagnosis?.rootCause || finding.detail || finding.title,
    severity: severity(finding.kind),
    related_screen_id: null,
    related_journey_id: null,
    issue_id: finding.id,
    suggested_fix: suggestedFix(finding),
  }));
}

function buildIssues(artifact: RunArtifact): IssueRow[] {
  return artifact.findings.map((finding) => ({
    id: finding.id,
    analysis_id: ANALYSIS_ID,
    title: finding.title,
    description: finding.detail,
    severity: severity(finding.kind),
    related_screen_id: '',
    related_journey_id: null,
    suggested_fix: finding.diagnosis?.rootCause ?? '',
    related_test_ids: [subjectId(finding)],
    status: 'open',
  }));
}

/** Does this Finding carry enough runtime detail to warrant an investigation payload? */
function findingHasDetail(finding: Finding): boolean {
  return Boolean(
    finding.evidence ||
      finding.diagnosis ||
      finding.console?.length ||
      finding.network?.length ||
      finding.timeline?.length ||
      finding.screenshots?.length,
  );
}

function buildInvestigations(
  artifact: RunArtifact,
  urls: Map<string, string>,
): InvestigationRow[] {
  const flowsById = new Map(artifact.flows.map((flow) => [flow.id, flow]));
  const byFlow = new Map<string, InvestigationRow>();

  for (const finding of artifact.findings) {
    if (!findingHasDetail(finding)) continue;
    const sid = subjectId(finding);
    const flow = finding.flowId ? flowsById.get(finding.flowId) : undefined;
    const videoUrl =
      evidenceUrl(urls, finding.evidence) ?? evidenceUrl(urls, flow?.evidence) ?? null;

    const payload = {
      testId: sid,
      recordedReason: finding.title,
      analysis: finding.diagnosis
        ? {
            rootCause: finding.diagnosis.rootCause,
            explanation: finding.detail,
            confidence: finding.diagnosis.confidence,
            faultDomain: faultDomain(finding.diagnosis.faultDomain),
            nextSteps: [],
          }
        : undefined,
      replay: {
        durationMs: flow?.durationMs ?? 0,
        frames: [],
        videoUrl,
      },
      evidence: (finding.screenshots ?? []).map((shot) => ({
        label: evidenceLabel(shot.label),
        screenId: '',
        caption: evidenceLabel(shot.label),
        tMs: shot.tMs,
        imageUrl: evidenceUrl(urls, shot.file),
      })),
      network: networkRows(finding.network),
      logs: logRows(finding.console),
      timeline: (finding.timeline ?? []).map((step) => ({
        tMs: step.tMs,
        screenId: '',
        label: step.label,
        kind: step.status === 'failed' ? 'failure' : 'action',
      })),
      comparison: [],
      environment: {
        device: 'Desktop',
        os: artifact.environment.os,
        appVersion: artifact.environment.autoendVersion,
        orientation: 'landscape',
        theme: 'light',
        network: 'online',
        timestamp: artifact.finishedAt ?? artifact.startedAt,
      },
    };

    // One investigation per subject (composite PK) — the last detailed Finding
    // for a given subject wins (only collides when several share a flowId).
    byFlow.set(sid, {
      analysis_id: ANALYSIS_ID,
      test_id: sid,
      payload,
    });
  }

  // Discovered/replayed flows carry WebM evidence even when no Finding references
  // them — create investigations so the UI can play hosted video.
  for (const flow of artifact.flows) {
    if (!flow.evidence || byFlow.has(flow.id)) continue;
    const base = flow.evidence.replace(/\.webm$/i, '');
    const candidates: Array<{ file: string; label: 'before' | 'after' | 'at-failure' }> = [
      { file: `${base}-before.png`, label: 'before' },
      { file: `${base}-after.png`, label: 'after' },
      { file: `${base}-at-failure.png`, label: 'at-failure' },
    ];
    const shots = candidates.filter((s) => urls.has(s.file) || urls.has(s.file.split('/').pop()!));

    byFlow.set(flow.id, {
      analysis_id: ANALYSIS_ID,
      test_id: flow.id,
      payload: {
        testId: flow.id,
        recordedReason: flow.title,
        replay: {
          durationMs: flow.durationMs ?? 0,
          frames: [],
          videoUrl: evidenceUrl(urls, flow.evidence),
        },
        evidence: shots.map((shot) => ({
          label: evidenceLabel(shot.label),
          screenId: '',
          caption: evidenceLabel(shot.label),
          tMs: 0,
          imageUrl: evidenceUrl(urls, shot.file),
        })),
        network: networkRows(flow.network),
        logs: logRows(flow.console),
        timeline: (flow.timeline ?? []).map((step) => ({
          tMs: step.tMs,
          screenId: '',
          label: step.label,
          kind: step.status === 'failed' ? 'failure' : 'action',
        })),
        comparison: [],
        environment: {
          device: 'Desktop',
          os: artifact.environment.os,
          appVersion: artifact.environment.autoendVersion,
          orientation: 'landscape',
          theme: 'light',
          network: 'online',
          timestamp: artifact.finishedAt ?? artifact.startedAt,
        },
      },
    });
  }

  return [...byFlow.values()];
}

/**
 * Partial summary — only the columns a Run knows; mock columns are preserved.
 * Counts come from the actual published `tests` rows (flows + finding-derived
 * synthetics), not from `artifact.flows` alone, so a run's fail/not-executed
 * tallies match what the UI lists. Screens are counted from what the streaming
 * reporter already wrote (publish never touches the `screens` table).
 */
function buildSummary(
  artifact: RunArtifact,
  tests: TestRow[],
  journeys: JourneyRow[],
  screensDiscovered: number,
) {
  const passed = tests.filter((t) => t.status === 'pass').length;
  const failed = tests.filter((t) => t.status === 'fail').length;
  const notExecuted = tests.filter((t) => t.status === 'not-executed').length;
  const critical = artifact.findings.filter((f) => f.kind === 'hard-failure').length;
  return {
    app_name: appName(artifact.target),
    app_url: artifact.target,
    analyzed_at: artifact.finishedAt ?? artifact.startedAt,
    user_flows: journeys.length,
    screens_discovered: screensDiscovered,
    tests_executed: passed + failed,
    tests_passed: passed,
    tests_failed: failed,
    tests_not_executed: notExecuted,
    critical_issues: critical,
  };
}

function throwOnError(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/**
 * Replace this analysis's rows in `table` with `rows`, atomically-enough
 * without a transaction: upsert the fresh rows FIRST, then delete only the
 * stale ones (same analysis, id no longer present). Upserting before deleting
 * means a mid-publish failure leaves the previous Run's data intact rather than
 * an emptied analysis — the delete-then-insert order did the opposite.
 */
async function replaceRows(
  supabase: SupabaseClient,
  table: string,
  idColumn: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (rows.length > 0) {
    throwOnError(
      `upsert ${table}`,
      (await supabase.from(table).upsert(rows, { onConflict: `analysis_id,${idColumn}` })).error,
    );
  }
  const keepIds = rows.map((row) => String(row[idColumn]));
  const pruneAll = supabase.from(table).delete().eq('analysis_id', ANALYSIS_ID);
  const prune =
    keepIds.length > 0 ? pruneAll.not(idColumn, 'in', `(${keepIds.join(',')})`) : pruneAll;
  throwOnError(`prune ${table}`, (await prune).error);
}

/**
 * The path inside an "Expected page "X" but it was not present" advisory
 * title, or undefined for any other finding. We control this template in the
 * explorer prompts, so matching it is reliable.
 */
function expectedMissingPath(finding: Finding): string | undefined {
  if (finding.kind !== 'advisory') return undefined;
  const match = /^Expected page "([^"]+)"/.exec(finding.title);
  return match ? match[1] : undefined;
}

/**
 * Reconcile the screens graph with the explorer's expected-but-missing
 * findings. A page the AI expected but that isn't really there is NOT a real
 * screen — but the user still wants it on the map, as an amber 'warning' node
 * with no elements ("the AI expected this page; it isn't here"). This is the
 * only reliable signal for SPA soft-404s: a client-side route with no matching
 * view renders "not found" without any HTTP response, so status-based dropping
 * can't see it — the explorer catches it by content and files an advisory.
 * Broken links (a real control that 404s) are hard-failures and stay red; only
 * advisory "Expected page" findings become warning nodes here.
 */
async function reconcileExpectedMissingScreens(
  supabase: SupabaseClient,
  artifact: RunArtifact,
): Promise<void> {
  const ids = new Set<string>();
  for (const finding of artifact.findings) {
    const path = expectedMissingPath(finding);
    if (!path) continue;
    try {
      ids.add(screenId(new URL(path, artifact.target).href));
    } catch {
      // A path we can't resolve to a URL isn't a screen — skip it.
    }
  }
  for (const id of ids) {
    // An expected-but-missing page carries no real UI: clear elements/nav and
    // flag it amber. Update first so a node a flow already created is downgraded
    // in place (keeping its position); insert only when nothing navigated there.
    const patch = { status: 'warning', elements: [], navigation: [], expected_actions: [] };
    const { data: updated, error: updateError } = await supabase
      .from('screens')
      .update(patch)
      .eq('analysis_id', ANALYSIS_ID)
      .eq('id', id)
      .select('id');
    throwOnError('warn missing screen', updateError);
    if (updated && updated.length > 0) continue;
    const { error: insertError } = await supabase.from('screens').insert({
      analysis_id: ANALYSIS_ID,
      id,
      name: screenTitle(id),
      type: 'core',
      description: 'Expected by exploration but not present',
      position: { x: 0, y: 0 },
      status: 'warning',
      is_entry_point: false,
      accent: '#f59e0b',
      elements: [],
      navigation: [],
      expected_actions: [],
      test_case_ids: [],
      issue_ids: [],
      last_run_id: artifact.runId,
    });
    throwOnError('insert missing screen', insertError);
  }
}

/**
 * Publish a Run's results to the Lumen Supabase. Write order matters:
 * evidence -> children (tests/issues/investigations) -> analyses summary LAST,
 * so `analyses.analyzed_at` acts as the atomic "run fully published" marker and
 * a reader never sees a half-written Run.
 */
export async function publishRun(
  artifact: RunArtifact,
  evidenceDir: string,
): Promise<PublishResult> {
  const supabase: SupabaseClient | null = getSupabase();
  if (!supabase) return { skipped: true, tests: 0, issues: 0, investigations: 0 };

  const urls = await uploadEvidence(supabase, artifact.runId, evidenceDir);

  const investigations = buildInvestigations(artifact, urls);
  const investigatedIds = new Set(investigations.map((row) => row.test_id));
  const tests = buildTests(artifact, investigatedIds);
  const issues = buildIssues(artifact);
  const journeys = buildJourneys(artifact);

  // Upsert fresh rows, then prune the previous Run's stale ones. Order matters:
  // new data lands before old data leaves, so a failure never empties the run.
  const asRows = <T>(rows: T[]): Array<Record<string, unknown>> =>
    rows as unknown as Array<Record<string, unknown>>;
  await replaceRows(supabase, 'journeys', 'id', asRows(journeys));
  await replaceRows(supabase, 'tests', 'id', asRows(tests));
  await replaceRows(supabase, 'issues', 'id', asRows(issues));
  await replaceRows(supabase, 'investigations', 'test_id', asRows(investigations));
  await replaceRows(supabase, 'insights', 'id', asRows(buildInsights(artifact)));

  // Turn expected-but-missing pages into amber warning nodes (0 elements)
  // before counting, so SPA soft-404s the explorer caught by content show up
  // as warnings on the map instead of lingering as red/failed screens.
  await reconcileExpectedMissingScreens(supabase, artifact);

  // Screens are streamed live by the reporter; count them for the summary
  // (publish otherwise only reconciles missing-page warnings above).
  const { count: screenCount, error: screenCountError } = await supabase
    .from('screens')
    .select('id', { count: 'exact', head: true })
    .eq('analysis_id', ANALYSIS_ID);
  throwOnError('count screens', screenCountError);

  // Commit marker: write the summary last so the UI flips to this Run atomically.
  const summary = buildSummary(artifact, tests, journeys, screenCount ?? 0);
  const { data: existing, error: selectError } = await supabase
    .from('analyses')
    .select('id')
    .eq('id', ANALYSIS_ID)
    .maybeSingle();
  throwOnError('read analysis', selectError);

  if (existing) {
    throwOnError(
      'update analysis',
      (await supabase.from('analyses').update(summary).eq('id', ANALYSIS_ID)).error,
    );
  } else {
    throwOnError(
      'insert analysis',
      (
        await supabase.from('analyses').insert({
          id: ANALYSIS_ID,
          ...summary,
          coverage_percent: 0,
          exploration_log: [],
          exploration_screen_order: [],
        })
      ).error,
    );
  }

  return {
    skipped: false,
    tests: tests.length,
    issues: issues.length,
    investigations: investigations.length,
  };
}
