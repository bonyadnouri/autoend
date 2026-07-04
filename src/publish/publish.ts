import { basename } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Finding, FlowSnapshot, RunArtifact } from '../report/types.js';
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
  status: 'pass' | 'fail' | 'not-executed';
  duration_ms: number;
  related_issue_ids: string[];
  has_investigation: boolean;
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

interface InvestigationRow {
  analysis_id: string;
  test_id: string;
  payload: unknown;
}

function testStatus(status: FlowSnapshot['status']): TestRow['status'] {
  if (status === 'passed') return 'pass';
  if (status === 'failed') return 'fail';
  return 'not-executed';
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

/** A non-advisory Finding without a Flow reads as a failed test in the UI. */
function findingTestStatus(kind: Finding['kind']): TestRow['status'] {
  return kind === 'advisory' ? 'not-executed' : 'fail';
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
      journey_id: '',
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
    });
  }
  return tests;
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
      network: (finding.network ?? []).map((entry, index) => ({
        id: `net-${index}`,
        method: entry.method.toUpperCase(),
        endpoint: entry.url,
        status: entry.status,
        durationMs: 0,
        failed: entry.status === 0 || entry.status >= 400,
        tMs: entry.tMs,
      })),
      logs: (finding.console ?? []).map((entry, index) => ({
        id: `log-${index}`,
        level: entry.level === 'warning' ? 'warn' : 'error',
        source: 'console',
        tMs: entry.tMs,
        message: entry.text,
      })),
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
        network: [],
        logs: [],
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

/** Partial summary — only the columns a Run knows; mock columns are preserved. */
function buildSummary(artifact: RunArtifact) {
  const passed = artifact.flows.filter((f) => f.status === 'passed').length;
  const failed = artifact.flows.filter((f) => f.status === 'failed').length;
  const notExecuted = artifact.flows.filter((f) => f.status === 'discovered').length;
  const critical = artifact.findings.filter((f) => f.kind === 'hard-failure').length;
  return {
    app_name: appName(artifact.target),
    app_url: artifact.target,
    analyzed_at: artifact.finishedAt ?? artifact.startedAt,
    user_flows: artifact.flows.length,
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

  // Upsert fresh rows, then prune the previous Run's stale ones. Order matters:
  // new data lands before old data leaves, so a failure never empties the run.
  const asRows = <T>(rows: T[]): Array<Record<string, unknown>> =>
    rows as unknown as Array<Record<string, unknown>>;
  await replaceRows(supabase, 'tests', 'id', asRows(tests));
  await replaceRows(supabase, 'issues', 'id', asRows(issues));
  await replaceRows(supabase, 'investigations', 'test_id', asRows(investigations));

  // Commit marker: write the summary last so the UI flips to this Run atomically.
  const summary = buildSummary(artifact);
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
          screens_discovered: 0,
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
