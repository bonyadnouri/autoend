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

function severity(kind: Finding['kind']): IssueRow['severity'] {
  if (kind === 'hard-failure') return 'critical';
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

function buildTests(artifact: RunArtifact, investigatedFlowIds: Set<string>): TestRow[] {
  return artifact.flows.map((flow) => {
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
      has_investigation: investigatedFlowIds.has(flow.id),
    };
  });
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
    related_test_ids: finding.flowId ? [finding.flowId] : [],
    status: 'open',
  }));
}

/** Does this Finding carry enough runtime detail to warrant an investigation payload? */
function hasDetail(finding: Finding): boolean {
  return Boolean(
    finding.flowId &&
      (finding.evidence ||
        finding.diagnosis ||
        finding.console?.length ||
        finding.network?.length ||
        finding.timeline?.length ||
        finding.screenshots?.length),
  );
}

function buildInvestigations(
  artifact: RunArtifact,
  urls: Map<string, string>,
): InvestigationRow[] {
  const flowsById = new Map(artifact.flows.map((flow) => [flow.id, flow]));
  const byFlow = new Map<string, InvestigationRow>();

  for (const finding of artifact.findings) {
    if (!hasDetail(finding) || !finding.flowId) continue;
    const flow = flowsById.get(finding.flowId);
    const videoUrl =
      evidenceUrl(urls, finding.evidence) ?? evidenceUrl(urls, flow?.evidence) ?? null;

    const payload = {
      testId: finding.flowId,
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

    // One investigation per flow (composite PK) — the last detailed Finding wins.
    byFlow.set(finding.flowId, {
      analysis_id: ANALYSIS_ID,
      test_id: finding.flowId,
      payload,
    });
  }

  // Discovered/replayed flows carry WebM evidence even when no Finding references
  // them — create investigations so the UI can play hosted video.
  for (const flow of artifact.flows) {
    if (!flow.evidence || byFlow.has(flow.id)) continue;
    const base = flow.evidence.replace(/\.webm$/i, '');
    const shots: Array<{ file: string; label: 'before' | 'after' | 'at-failure' }> = [
      { file: `${base}-before.png`, label: 'before' },
      { file: `${base}-after.png`, label: 'after' },
      { file: `${base}-at-failure.png`, label: 'at-failure' },
    ].filter((s) => urls.has(s.file) || urls.has(s.file.split('/').pop()!));

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
  const investigatedFlowIds = new Set(investigations.map((row) => row.test_id));
  const tests = buildTests(artifact, investigatedFlowIds);
  const issues = buildIssues(artifact);

  // Clear the previous Run's results for this analysis before inserting fresh.
  throwOnError(
    'clear investigations',
    (await supabase.from('investigations').delete().eq('analysis_id', ANALYSIS_ID)).error,
  );
  throwOnError(
    'clear tests',
    (await supabase.from('tests').delete().eq('analysis_id', ANALYSIS_ID)).error,
  );
  throwOnError(
    'clear issues',
    (await supabase.from('issues').delete().eq('analysis_id', ANALYSIS_ID)).error,
  );

  if (tests.length > 0) {
    throwOnError('insert tests', (await supabase.from('tests').insert(tests)).error);
  }
  if (issues.length > 0) {
    throwOnError('insert issues', (await supabase.from('issues').insert(issues)).error);
  }
  if (investigations.length > 0) {
    throwOnError(
      'insert investigations',
      (await supabase.from('investigations').insert(investigations)).error,
    );
  }

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
