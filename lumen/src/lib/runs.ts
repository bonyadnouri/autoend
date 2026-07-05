import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "./supabase";
import { DEFAULT_ANALYSIS_ID } from "./constants";

export type RunKind = "full" | "single-test";
export type RunStatus = "queued" | "running" | "finished" | "failed" | "cancelled";

export interface RunRow {
  id: string;
  analysis_id: string;
  kind: RunKind;
  test_id: string | null;
  effort: string | null;
  target_url: string | null;
  status: RunStatus;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  model: string | null;
}

export interface AiModel {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface RunEventRow {
  run_id: string;
  seq: number;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface StartRunInput {
  analysisId?: string;
  kind: RunKind;
  testId?: string;
  targetUrl?: string;
  effort?: string;
  /** Cursor model id the daemon should run every agent on; null = daemon default. */
  model?: string | null;
}

export async function startRun(input: StartRunInput): Promise<string> {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  const analysisId = input.analysisId ?? DEFAULT_ANALYSIS_ID;
  const { error } = await client.from("runs").insert({
    id,
    analysis_id: analysisId,
    kind: input.kind,
    test_id: input.testId ?? null,
    target_url: input.targetUrl ?? null,
    effort: input.effort ?? null,
    model: input.model ?? null,
    status: "queued",
  });
  if (error) throw error;
  return id;
}

/** Available Cursor models, published by the daemon into ai_models. */
export async function fetchAiModels(): Promise<AiModel[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("ai_models")
    .select("id, label, is_default")
    .order("is_default", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: (row.label as string) ?? (row.id as string),
    isDefault: Boolean(row.is_default),
  }));
}

export function useAiModels() {
  return useQuery({
    queryKey: ["ai-models"],
    queryFn: fetchAiModels,
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });
}

/**
 * Watch a just-queued run: resolves true once the daemon claims it (status
 * leaves 'queued'), or false if it's still queued after `timeoutMs` — a strong
 * signal the daemon isn't running. Used to warn the user immediately.
 */
export async function waitForRunPickup(runId: string, timeoutMs: number): Promise<boolean> {
  const client = requireSupabase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await client.from("runs").select("status").eq("id", runId).maybeSingle();
    if (error) throw error;
    if (data && data.status !== "queued") return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export async function fetchActiveRun(analysisId: string): Promise<RunRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("runs")
    .select("*")
    .eq("analysis_id", analysisId)
    .in("status", ["queued", "running"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RunRow | null;
}

export async function fetchRunEvents(runId: string): Promise<RunEventRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("run_events")
    .select("*")
    .eq("run_id", runId)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RunEventRow[];
}

export function useActiveRun(analysisId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["active-run", analysisId],
    queryFn: () => fetchActiveRun(analysisId),
    enabled: isSupabaseConfigured,
    refetchInterval: (q) => (q.state.data?.status === "queued" ? 2000 : false),
  });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = requireSupabase();
    const channel = client
      .channel(`runs-active-${analysisId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runs", filter: `analysis_id=eq.${analysisId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["active-run", analysisId] });
          void queryClient.invalidateQueries({ queryKey: ["analysis-bundle", analysisId] });
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [analysisId, queryClient]);

  return query;
}

export function useRunEvents(runId: string | undefined) {
  const [events, setEvents] = useState<RunEventRow[]>([]);
  // Supabase reuses a channel instance when two subscriptions share a topic,
  // and calling `.on()` on an already-subscribed channel throws. Multiple hook
  // instances can watch the same run (e.g. the run banner's event count plus
  // the expanded console), so each instance needs its own unique topic.
  const channelKeyRef = useRef<string>();
  if (!channelKeyRef.current) channelKeyRef.current = crypto.randomUUID();

  const query = useQuery({
    queryKey: ["run-events", runId],
    queryFn: () => fetchRunEvents(runId!),
    enabled: Boolean(runId) && isSupabaseConfigured,
  });

  useEffect(() => {
    if (query.data) setEvents(query.data);
  }, [query.data]);

  useEffect(() => {
    if (!runId || !isSupabaseConfigured) return;
    const client = requireSupabase();
    const channel = client
      .channel(`run-events-${runId}-${channelKeyRef.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "run_events", filter: `run_id=eq.${runId}` },
        (payload) => {
          const row = payload.new as RunEventRow;
          setEvents((prev) => (prev.some((e) => e.seq === row.seq) ? prev : [...prev, row]));
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [runId]);

  return { events, isLoading: query.isLoading };
}

/** Realtime invalidation for screens, edges, and tests during a live run. */
export function useLiveRunSync(analysisId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    const client = requireSupabase();
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["analysis-bundle", analysisId] });
    };
    const channel = client
      .channel(`live-sync-${analysisId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "screens", filter: `analysis_id=eq.${analysisId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "screen_edges", filter: `analysis_id=eq.${analysisId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "tests", filter: `analysis_id=eq.${analysisId}` }, invalidate)
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [analysisId, enabled, queryClient]);
}
