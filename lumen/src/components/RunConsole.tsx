import { useRunEvents } from "../lib/runs";

function formatPayload(payload: Record<string, unknown>): string {
  if (payload.message && typeof payload.message === "string") return payload.message;
  if (payload.title && typeof payload.title === "string") {
    const state = payload.state ? ` ${String(payload.state)}` : "";
    return `${payload.title}${state}`;
  }
  return JSON.stringify(payload);
}

export function RunConsole({ runId }: { runId: string }) {
  const { events } = useRunEvents(runId);

  return (
    <div className="h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100">
      {events.length === 0 ? (
        <p className="text-slate-500">Waiting for run events…</p>
      ) : (
        events.map((e) => (
          <div key={e.seq} className="py-0.5 border-b border-slate-800 last:border-0">
            <span className="text-slate-500">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
            <span className="text-cyan-400">{e.type}</span>{" "}
            <span>{formatPayload(e.payload)}</span>
          </div>
        ))
      )}
    </div>
  );
}
