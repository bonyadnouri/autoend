import type { SupabaseClient } from '@supabase/supabase-js';
import type { RunEvent } from './events.js';
import { screenTitle } from './screen-id.js';
import type {
  EdgeFact,
  RunReporter,
  RunStartedInfo,
  RunSummary,
  ScreenFact,
  TestStatusFact,
} from './reporter.js';

const SCREEN_ACCENT = 'slate';

/**
 * Screen-status precedence for live streaming. A run touches a screen many
 * times (a live 'running' on navigation, a settled 'passed'/'failed', a
 * discovered-flow revisit) and flows replay in parallel, so writes arrive in
 * an unpredictable order. Ranking lets a stream write RAISE a screen's status
 * but never DOWNGRADE one already settled THIS run — the bug behind both
 * "screens stuck cyan on 'running'" (a later terminal state simply wins) and
 * "a passing/discovered flow greened-over a failure". 'broken'/'healthy' are
 * only ever written by publish (direct, post-stream); listed so a stale prior
 * value never blocks a fresh write. Higher = more severe / more final.
 */
const SCREEN_RANK: Record<string, number> = {
  running: 0,
  discovered: 1,
  passed: 2,
  healthy: 2,
  warning: 3,
  failed: 4,
  broken: 5,
};

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

  private awaitChain(): Promise<void> {
    return this.chain;
  }

  async flush(): Promise<void> {
    await this.awaitChain();
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
    const { error } = await this.supabase
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
    if (error) throw error;
  }

  async runFinished(summary: RunSummary): Promise<void> {
    this.enqueue(async () => {
      // Record the summary counts live either way. On SUCCESS, do NOT flip the
      // row to 'finished' here: publish still runs AFTER this (it writes
      // journeys, insights and the analysis summary), and the daemon calls
      // queue.markFinished once publish completes — so the row goes 'finished'
      // only when the graph is fully written, never showing a "finished" run
      // with half-written data. A FAILURE is written immediately so it surfaces
      // without waiting on anything downstream.
      const patch: Record<string, unknown> = {
        summary: {
          flowsReplayed: summary.flowsReplayed,
          flowsDiscovered: summary.flowsDiscovered,
          findingCounts: summary.findingCounts,
        },
      };
      if (summary.status === 'failed') {
        patch.status = 'failed';
        patch.finished_at = new Date().toISOString();
        patch.error = summary.error ?? null;
      }
      const { error } = await this.supabase.from('runs').update(patch).eq('id', summary.runId);
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
      // Only set columns the fact actually carries: a runtime visit sets status,
      // an enrichment fact (elements/nav) omits status so it never downgrades a
      // status a flow already settled, and never wipes elements it didn't capture.
      const patch: Record<string, unknown> = { name, last_run_id: this.runId };
      if (screen.elements !== undefined) patch.elements = screen.elements;
      if (screen.navigation !== undefined) patch.navigation = screen.navigation;
      if (screen.expectedActions !== undefined) patch.expected_actions = screen.expectedActions;

      // Read the current row first: it tells us whether to insert vs update AND
      // (with last_run_id) lets us apply status precedence. Reading also keeps
      // the update from clobbering the stored layout position (we never patch it).
      const { data: existing, error: readError } = await this.supabase
        .from('screens')
        .select('status, last_run_id')
        .eq('analysis_id', this.analysisId)
        .eq('id', screen.id)
        .maybeSingle();
      if (readError) throw readError;

      // Apply status only when it doesn't DOWNGRADE one already settled this run
      // (failed > warning > passed > discovered > running). A status from a
      // PRIOR run (different last_run_id) is stale and may always be replaced —
      // that's how a fixed test's re-run clears its old red on the screen.
      if (screen.status !== undefined) {
        const sameRun = existing?.last_run_id === this.runId;
        const downgrade =
          existing !== null &&
          sameRun &&
          SCREEN_RANK[screen.status] < (SCREEN_RANK[existing.status as string] ?? -1);
        if (!downgrade) patch.status = screen.status;
      }

      if (existing !== null) {
        const { error } = await this.supabase
          .from('screens')
          .update(patch)
          .eq('analysis_id', this.analysisId)
          .eq('id', screen.id);
        if (error) throw error;
        return;
      }

      // Enrichment facts (explorer-reported elements/nav) must never CREATE a
      // screen — only a real, verified navigation may. This stops an agent from
      // conjuring a node for a path no flow actually reached (e.g. a guessed or
      // 404 route). If there's no row to enrich, drop the fact silently.
      if (screen.enrichOnly) return;

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
        status: screen.status ?? 'discovered',
        is_entry_point: screen.path === '/',
        accent: SCREEN_ACCENT,
        elements: screen.elements ?? [],
        navigation: screen.navigation ?? [],
        expected_actions: screen.expectedActions ?? [],
        test_case_ids: [],
        issue_ids: [],
        last_run_id: this.runId,
      });
      if (insertError) throw insertError;
    });
  }

  async screenDropped(id: string): Promise<void> {
    this.enqueue(async () => {
      // A navigation whose document responded HTTP >= 400 is not a real screen.
      // Remove any row we optimistically created for it plus its dangling edges
      // so the map never shows phantom 404 nodes (e.g. /signup, /contact).
      const { error: edgeError } = await this.supabase
        .from('screen_edges')
        .delete()
        .eq('analysis_id', this.analysisId)
        .or(`source.eq.${id},target.eq.${id}`);
      if (edgeError) throw edgeError;
      const { error } = await this.supabase
        .from('screens')
        .delete()
        .eq('analysis_id', this.analysisId)
        .eq('id', id);
      if (error) throw error;
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
      const row: Record<string, unknown> = {
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
      };
      // Stream the script with the status so the row is replayable immediately.
      // The daemon's next run hydrates its flow map from `tests.script`; before
      // this, the script only landed at publish — so a run that died pre-publish
      // (crash, Ctrl+C, swallowed publish error) left every row script-less and
      // the NEXT run silently replayed nothing. Only set when carried, so a
      // 'running' fact never nulls a script an earlier run already stored.
      if (update.script !== undefined) row.script = update.script;
      const { error } = await this.supabase.from('tests').upsert(row, { onConflict: 'analysis_id,id' });
      if (error) throw error;
      // Investigations (video, screenshots, full payload) are written ONLY by
      // publishRun after evidence is uploaded. Writing a stub here used to race
      // publish and overwrite replay.videoUrl back to null — the UI showed no
      // video even though the WebM uploaded fine.
    });
  }
}
