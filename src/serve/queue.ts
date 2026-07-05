import type { SupabaseClient } from '@supabase/supabase-js';
import type { Effort } from '../run/effort.js';
import type { RunSummary } from '../stream/reporter.js';

export interface RunRequest {
  runId: string;
  analysisId: string;
  kind: 'full' | 'single-test';
  testId?: string;
  targetUrl?: string;
  effort?: Effort;
  /** Cursor model id chosen in the UI for this run; absent = daemon default. */
  model?: string;
}

export interface RunQueue {
  claimNext(): Promise<RunRequest | null>;
  cancelStale(): Promise<number>;
  markFinished(runId: string, summary: RunSummary): Promise<void>;
  markFailed(runId: string, error: string): Promise<void>;
  watch(onNew: () => void): () => void;
}

const RUN_COLUMNS = 'id, analysis_id, kind, test_id, target_url, effort, model';

export class SupabaseQueue implements RunQueue {
  private unsub?: () => void;

  /**
   * @param analysisId when set, the daemon only serves runs for that one
   * analysis (a project-scoped daemon). When undefined, it serves every
   * project: it claims any queued run and carries that run's own analysis_id
   * through streaming and publish, so each project's data stays isolated.
   */
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly analysisId?: string,
  ) {}

  async claimNext(): Promise<RunRequest | null> {
    let pending = this.supabase
      .from('runs')
      .select(RUN_COLUMNS)
      .eq('status', 'queued')
      .order('requested_at', { ascending: true })
      .limit(1);
    if (this.analysisId) pending = pending.eq('analysis_id', this.analysisId);
    const { data: queued, error: selectError } = await pending.maybeSingle();
    if (selectError) throw selectError;
    if (!queued) return null;

    const { data: claimed, error: updateError } = await this.supabase
      .from('runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', queued.id)
      .eq('status', 'queued')
      .select(RUN_COLUMNS)
      .maybeSingle();
    if (updateError) throw updateError;
    if (!claimed) return null;

    return {
      runId: claimed.id,
      analysisId: (claimed.analysis_id as string) ?? this.analysisId ?? '',
      kind: claimed.kind as RunRequest['kind'],
      testId: claimed.test_id ?? undefined,
      targetUrl: claimed.target_url ?? undefined,
      effort: (claimed.effort as Effort | null) ?? undefined,
      model: (claimed.model as string | null) ?? undefined,
    };
  }

  /**
   * Cancel runs left over from a previous session so a freshly started daemon
   * begins idle and only executes runs requested after it came up. Without this,
   * startup would immediately claim anything still `queued` — or orphaned as
   * `running` by a daemon that was killed mid-run — and execute it, which looks
   * like the daemon "randomly" starting a run nobody asked for. Scoped to this
   * daemon's analysis when one is configured; otherwise it clears every project.
   */
  async cancelStale(): Promise<number> {
    let pending = this.supabase
      .from('runs')
      .update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
        error: 'cancelled on daemon restart',
      })
      .in('status', ['queued', 'running']);
    if (this.analysisId) pending = pending.eq('analysis_id', this.analysisId);
    const { data, error } = await pending.select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }

  async markFinished(runId: string, summary: RunSummary): Promise<void> {
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
      .eq('id', runId);
    if (error) throw error;
  }

  async markFailed(runId: string, errorMessage: string): Promise<void> {
    await this.markFinished(runId, { runId, status: 'failed', error: errorMessage });
  }

  watch(onNew: () => void): () => void {
    // Scoped daemon watches one analysis; a serve-all daemon watches every run.
    const filter = this.analysisId
      ? { event: 'INSERT' as const, schema: 'public', table: 'runs', filter: `analysis_id=eq.${this.analysisId}` }
      : { event: 'INSERT' as const, schema: 'public', table: 'runs' };
    const channel = this.supabase
      .channel(`runs-${this.analysisId ?? 'all'}`)
      .on('postgres_changes', filter, () => onNew())
      .subscribe();
    this.unsub = () => {
      void this.supabase.removeChannel(channel);
    };
    return this.unsub;
  }
}
