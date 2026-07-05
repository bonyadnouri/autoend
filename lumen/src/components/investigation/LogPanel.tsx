import { useMemo, useState } from "react";
import { Terminal, Search, ChevronDown, ChevronRight } from "lucide-react";
import type { LogEntry, LogLevel } from "../../types";
import { formatClock, logLevelLabel } from "../../data/helpers";

const levelTone: Record<LogLevel, string> = {
  info: "text-sky-400",
  warn: "text-amber-400",
  error: "text-rose-400",
  debug: "text-slate-400",
};

const levels: (LogLevel | "all")[] = ["all", "info", "warn", "error"];

export function LogPanel({ logs }: { logs: LogEntry[] }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [openStacks, setOpenStacks] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () =>
      logs.filter(
        (l) =>
          (level === "all" || l.level === level) &&
          (query === "" || l.message.toLowerCase().includes(query.toLowerCase())),
      ),
    [logs, level, query],
  );

  const errorCount = logs.filter((l) => l.level === "error").length;

  function toggleStack(id: string) {
    setOpenStacks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Terminal size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Logs</h2>
        {errorCount > 0 && (
          <span className="pill bg-status-failBg text-status-fail">{errorCount} errors</span>
        )}

        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex gap-1">
          {levels.map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                level === lv
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto bg-slate-900 px-4 py-3 font-mono text-[13px] leading-relaxed">
        {filtered.length === 0 && (
          <div className="py-6 text-center text-slate-500">No logs match your filters.</div>
        )}
        {filtered.map((log) => (
          <div key={log.id} className="py-0.5">
            <div className="flex items-start gap-3">
              <span className="select-none text-slate-600">{formatClock(log.tMs)}</span>
              <span className={`w-12 shrink-0 font-semibold ${levelTone[log.level]}`}>
                {logLevelLabel[log.level]}
              </span>
              <span className="text-slate-500">[{log.source}]</span>
              <span className="flex-1 text-slate-200">{log.message}</span>
              {log.stack && (
                <button
                  onClick={() => toggleStack(log.id)}
                  className="shrink-0 text-slate-400 hover:text-slate-200"
                  aria-label="Toggle stack trace"
                >
                  {openStacks.has(log.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              )}
            </div>
            {log.stack && openStacks.has(log.id) && (
              <pre className="ml-[4.5rem] mt-1 whitespace-pre-wrap border-l-2 border-slate-700 pl-3 text-xs text-rose-300">
                {log.stack}
              </pre>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
