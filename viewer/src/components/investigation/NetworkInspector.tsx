import { Globe } from "lucide-react";
import type { NetworkEntry } from "../../types";
import { formatClock } from "../../data/helpers";

const methodTone: Record<string, string> = {
  GET: "bg-sky-100 text-sky-700",
  POST: "bg-emerald-100 text-emerald-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-violet-100 text-violet-700",
  DELETE: "bg-rose-100 text-rose-700",
};

function statusTone(status: number): string {
  if (status === 0 || status >= 400) return "text-status-fail";
  if (status >= 300) return "text-status-warn";
  return "text-status-pass";
}

/** Retyped to NetworkEntry[] for the real schema; Task 5 wires it into FindingDetails. */
export function NetworkInspector({ requests }: { requests: NetworkEntry[] }) {
  const failedCount = requests.filter((r) => r.status === 0 || r.status >= 400).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Globe size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Network</h2>
        <span className="ml-auto text-xs text-slate-500">
          {requests.length} requests
          {failedCount > 0 && <span className="text-status-fail"> - {failedCount} failed</span>}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Method</th>
              <th className="px-4 py-2.5 font-semibold">URL</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((req, i) => {
              const isFailed = req.status === 0 || req.status >= 400;
              return (
                <tr key={i} className={isFailed ? "bg-status-failBg/40" : ""}>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        methodTone[req.method] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {req.method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{req.url}</td>
                  <td className={`px-4 py-2.5 font-semibold ${statusTone(req.status)}`}>
                    {req.status === 0 ? "failed" : req.status}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                    {formatClock(req.tMs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
