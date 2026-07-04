import { useMemo, useState } from "react";
import { Terminal, Search } from "lucide-react";
import type { ConsoleEntry } from "../../types";
import { formatClock } from "../../data/helpers";

const levelTone: Record<ConsoleEntry["level"], string> = {
  error: "text-rose-400",
  warning: "text-amber-400",
};

const levels: (ConsoleEntry["level"] | "all")[] = ["all", "warning", "error"];

/** Retyped to ConsoleEntry[] for the real schema; Task 5 wires it into FindingDetails. */
export function LogPanel({ logs }: { logs: ConsoleEntry[] }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<ConsoleEntry["level"] | "all">("all");

  const filtered = useMemo(
    () =>
      logs.filter(
        (l) =>
          (level === "all" || l.level === level) &&
          (query === "" || l.text.toLowerCase().includes(query.toLowerCase())),
      ),
    [logs, level, query],
  );

  const errorCount = logs.filter((l) => l.level === "error").length;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Terminal size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Console</h2>
        {errorCount > 0 && (
          <span className="pill bg-status-failBg text-status-fail">{errorCount} errors</span>
        )}

        <div className="relative ml-auto">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter console..."
            className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex gap-1">
          {levels.map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                level === lv ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto bg-slate-900 px-4 py-3 font-mono text-[13px] leading-relaxed">
        {filtered.length === 0 && (
          <div className="py-6 text-center text-slate-500">Nothing matches your filters.</div>
        )}
        {filtered.map((log, i) => (
          <div key={i} className="flex items-start gap-3 py-0.5">
            <span className="select-none text-slate-600">{formatClock(log.tMs)}</span>
            <span className={`w-16 shrink-0 font-semibold uppercase ${levelTone[log.level]}`}>
              {log.level}
            </span>
            <span className="flex-1 text-slate-200">{log.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
