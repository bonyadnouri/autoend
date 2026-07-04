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
}

export interface RunQueue {
  claimNext(): Promise<RunRequest | null>;
  markFinished(runId: string, summary: RunSummary): Promise<void>;
  markFailed(runId: string, error: string): Promise<void>;
  watch(onNew: () => void): () => void;
}

export class SupabaseQueue implements RunQueue {
  private unsub?: () => void;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly analysisId: string,
  ) {}

  async claimNext(): Promise<RunRequest | null> {
    const { data: queued, error: selectError } = await this.supabase
      .from('runs')
      .select('id, kind, test_id, target_url, effort')
      .eq('analysis_id', this.analysisId)
      .eq('status', 'queued')
      .order('requested_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (selectError) throw selectError;
    if (!queued) return null;

    const { data: claimed, error: updateError } = await this.supabase
      .from('runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', queued.id)
      .eq('status', 'queued')
      .select('id, kind, test_id, target_url, effort')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!claimed) return null;

    return {
      runId: claimed.id,
      analysisId: this.analysisId,
      kind: claimed.kind as RunRequest['kind'],
      testId: claimed.test_id ?? undefined,
      targetUrl: claimed.target_url ?? undefined,
      effort: (claimed.effort as Effort | null) ?? undefined,
    };
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
    const channel = this.supabase
      .channel(`runs-${this.analysisId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'runs', filter: `analysis_id=eq.${this.analysisId}` },
        () => onNew(),
      )
      .subscribe();
    this.unsub = () => {
      void this.supabase.removeChannel(channel);
    };
    return this.unsub;
  }
}
