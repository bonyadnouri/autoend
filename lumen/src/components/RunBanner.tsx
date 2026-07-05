import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Terminal } from "lucide-react";
import { RunConsole } from "./RunConsole";
import { useRunEvents } from "../lib/runs";
import type { RunRow } from "../lib/runs";

export function RunBanner({
  run,
  showConsole,
  screenCount = 0,
}: {
  run: RunRow;
  showConsole?: boolean;
  /** Used to auto-open logs while the map is still empty, then collapse once screens arrive. */
  screenCount?: number;
}) {
  const [logsOpen, setLogsOpen] = useState(false);
  const prevScreenCount = useRef(screenCount);
  const isActive = run.status === "queued" || run.status === "running";
  const { events } = useRunEvents(showConsole && isActive ? run.id : undefined);

  useEffect(() => {
    if (!showConsole || !isActive) return;
    if (screenCount === 0) {
      setLogsOpen(true);
    } else if (prevScreenCount.current === 0) {
      setLogsOpen(false);
    }
    prevScreenCount.current = screenCount;
  }, [screenCount, showConsole, isActive]);
  const statusColor =
    run.status === "running"
      ? "text-cyan-700 bg-cyan-50 border-cyan-200"
      : run.status === "queued"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : run.status === "finished"
          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
          : "text-red-700 bg-red-50 border-red-200";

  return (
    <div className={`shrink-0 rounded-lg border px-4 py-3 ${statusColor}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {isActive && <Loader2 className="h-4 w-4 animate-spin" />}
        <span>
          Run {run.kind === "single-test" ? `(test ${run.test_id})` : "(full analysis)"} — {run.status}
        </span>
      </div>
      {run.status === "queued" && (
        <p className="mt-1 text-xs opacity-80">
          Waiting for daemon. Start it with: <code className="font-mono">npx @bonyadnouri/autoend serve</code>
        </p>
      )}
      {run.error && <p className="mt-1 text-xs">{run.error}</p>}
      {showConsole && isActive && (
        <div className="mt-3 border-t border-current/10 pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-xs opacity-80 transition-opacity hover:opacity-100"
            onClick={() => setLogsOpen((open) => !open)}
            aria-expanded={logsOpen}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Terminal className="h-3 w-3" /> Live log
              {events.length > 0 && (
                <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-semibold">
                  {events.length}
                </span>
              )}
            </span>
            {logsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {logsOpen && (
            <div className="mt-2">
              <RunConsole runId={run.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
