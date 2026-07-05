import type { SupabaseClient } from '@supabase/supabase-js';
import type { RunEvent } from './events.js';
import { screenTitle } from './screen-id.js';
import type { EdgeFact, RunReporter, RunStartedInfo, RunSummary, ScreenFact, TestStatusFact } from './reporter.js';

const SCREEN_ACCENT = 'slate';

function screenType(path: string): string {
  if (path === '/') return 'entry';
  if (path.includes(':id')) return 'detail';
  return 'core';
}

function testDbStatus(status: TestStatusFact['status']): 'pass' | 'fail' | 'not-executed' | 'running' {
  if (status === 'running') return 'running';
  if (status === 'failed') return 'fail';
  // 'passed', 'healed', and 'discovered' all mean the flow was verified by running.
  return 'pass';
}

/** Child tables scoped by analysis_id that a fresh full run replaces wholesale. */
const SEEDED_TABLES = ['screen_edges', 'screens', 'journeys', 'insights', 'tests', 'issues', 'investigations'] as const;

function appName(target: string): string {
  try {
    return new URL(target).host;
  } catch {
    return target;
  }
}

/** Maps run facts to Lumen Supabase tables. Never throws. */
export class SupabaseReporter implements RunReporter {
  private seq = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly analysisId: string,
    private runId: string,
  ) {}

  private enqueue(work: () => Promise<void>): void {
    this.chain = this.chain.then(work).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`SupabaseReporter: ${message}`);
    });
  }

  private flush(): Promise<void> {
    return this.chain;
  }

  async runStarted(info: RunStartedInfo): Promise<void> {
    this.runId = info.runId;
    // A full run rebuilds the whole picture, so wipe the previous run's (or the
    // seeded demo's) graph/tests up front — otherwise stale ShopFlow screens,
    // edges and tests linger next to the live results. Single-test runs touch
    // only their own row and must leave everything else intact.
    if (info.kind === 'full') {
      this.enqueue(() => this.clearSeededData(info.target));
    }
    this.enqueue(async () => {
      const { error } = await this.supabase.from('runs').upsert({
        id: info.runId,
        analysis_id: this.analysisId,
        kind: info.kind,
        target_url: info.target,
        effort: info.effort,
        status: 'running',
        started_at: new Date().toISOString(),
      });
      if (error) throw error;
    });
    await this.flush();
  }

  /**
   * Delete this analysis's stale child rows and reset its summary counters so
   * the UI starts the run from a clean slate. The analyses row itself is kept
   * (its id is referenced everywhere and re-created lazily by publish anyway).
   */
  private async clearSeededData(target: string): Promise<void> {
    for (const table of SEEDED_TABLES) {
      const { error } = await this.supabase.from(table).delete().eq('analysis_id', this.analysisId);
      if (error) throw error;
    }
    await this.supabase
      .from('analyses')
      .update({
        app_name: appName(target),
        app_url: target,
        user_flows: 0,
        tests_executed: 0,
        tests_passed: 0,
        tests_failed: 0,
        tests_not_executed: 0,
        critical_issues: 0,
        screens_discovered: 0,
        coverage_percent: 0,
        exploration_log: [],
        exploration_screen_order: [],
      })
      .eq('id', this.analysisId);
  }

  async runFinished(summary: RunSummary): Promise<void> {
    this.enqueue(async () => {
      const { error } = await this.supabase
        .from('runs')
        .update({
          status: summary.status,
          finished_at: new Date().toISOString(),
          error: summary.error ?? null,
          summary: {
            flowsReplayed: summary.flowsReplayed,
            flowsDiscovered: summary.flowsDiscovered,
            findingCounts: summary.findingCounts,
          },
        })
        .eq('id', summary.runId);
      if (error) throw error;
    });
    await this.flush();
  }

  async event(event: RunEvent): Promise<void> {
    this.enqueue(async () => {
      this.seq += 1;
      const { error } = await this.supabase.from('run_events').insert({
        run_id: this.runId,
        seq: this.seq,
        type: event.type,
        payload: event,
      });
      if (error) throw error;
    });
  }

  async screenSeen(screen: ScreenFact): Promise<void> {
    this.enqueue(async () => {
      const name = screen.title ?? screenTitle(screen.path);
      // Update-first so repeat visits and re-runs never clobber a screen's
      // stored layout position (upsert would rewrite position back to 0,0).
      const { data: updated, error: updateError } = await this.supabase
        .from('screens')
        .update({ name, status: screen.status, last_run_id: this.runId })
        .eq('analysis_id', this.analysisId)
        .eq('id', screen.id)
        .select('id');
      if (updateError) throw updateError;
      if (updated && updated.length > 0) return;

      // Position is left at the origin as a sentinel: the UI derives graph
      // layout from the screen/edge structure (lib/layout.ts), so the backend
      // never bakes in absolute pixel coordinates.
      const { error: insertError } = await this.supabase.from('screens').insert({
        analysis_id: this.analysisId,
        id: screen.id,
        name,
        type: screenType(screen.path),
        description: `Discovered at ${screen.path}`,
        position: { x: 0, y: 0 },
        status: screen.status,
        is_entry_point: screen.path === '/',
        accent: SCREEN_ACCENT,
        elements: [],
        navigation: [],
        expected_actions: [],
        test_case_ids: [],
        issue_ids: [],
        last_run_id: this.runId,
      });
      if (insertError) throw insertError;
    });
  }

  async edgeSeen(edge: EdgeFact): Promise<void> {
    this.enqueue(async () => {
      const { error } = await this.supabase.from('screen_edges').upsert(
        {
          analysis_id: this.analysisId,
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          status: edge.status ?? 'normal',
        },
        { onConflict: 'analysis_id,id' },
      );
      if (error) throw error;
    });
  }

  async testStatus(update: TestStatusFact): Promise<void> {
    this.enqueue(async () => {
      const previouslyPassed =
        update.status === 'passed' || update.status === 'healed' || update.status === 'discovered';
      const { error } = await this.supabase.from('tests').upsert(
        {
          analysis_id: this.analysisId,
          id: update.testId,
          name: update.title,
          journey_id: '',
          screen_ids: [],
          preconditions: [],
          steps: (update.timeline ?? []).map((step) => ({
            action: step.label,
            expected: step.status === 'passed' ? 'Step succeeds' : 'Step fails',
          })),
          repro_steps: (update.timeline ?? []).map((step, index) => `${index + 1}. ${step.label}`),
          expected_result: 'Flow completes without regressions',
          actual_result: update.detail ?? '',
          status: testDbStatus(update.status),
          duration_ms: update.durationMs ?? 0,
          related_issue_ids: [],
          has_investigation: update.status === 'failed',
          last_run_id: this.runId,
          previously_passed: previouslyPassed,
        },
        { onConflict: 'analysis_id,id' },
      );
      if (error) throw error;

      if (update.status === 'failed' && (update.console?.length || update.network?.length)) {
        const payload = {
          testId: update.testId,
          recordedReason: update.detail ?? update.title,
          logs: (update.console ?? []).map((entry, index) => ({
            id: `log-${index}`,
            level: entry.level === 'warning' ? 'warn' : 'error',
            source: 'console',
            tMs: entry.tMs,
            message: entry.text,
          })),
          network: (update.network ?? []).map((entry, index) => ({
            id: `net-${index}`,
            method: entry.method.toUpperCase(),
            endpoint: entry.url,
            status: entry.status,
            durationMs: 0,
            failed: entry.status === 0 || entry.status >= 400,
            tMs: entry.tMs,
          })),
          timeline: (update.timeline ?? []).map((step) => ({
            tMs: step.tMs,
            screenId: '',
            label: step.label,
            kind: step.status === 'failed' ? 'failure' : 'action',
          })),
        };
        await this.supabase.from('investigations').upsert(
          {
            analysis_id: this.analysisId,
            test_id: update.testId,
            payload,
          },
          { onConflict: 'analysis_id,test_id' },
        );
      }
    });
  }
}
