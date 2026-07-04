import { Fragment, useState } from "react";
import { Globe, ChevronDown, ChevronRight } from "lucide-react";
import type { HttpMethod, NetworkRequest } from "../../types";
import { formatDuration } from "../../data/helpers";

const methodTone: Record<HttpMethod, string> = {
  GET: "bg-sky-100 text-sky-700",
  POST: "bg-emerald-100 text-emerald-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-violet-100 text-violet-700",
  DELETE: "bg-rose-100 text-rose-700",
};

function statusTone(status: number): string {
  if (status >= 500) return "text-status-fail";
  if (status >= 400) return "text-status-fail";
  if (status >= 300) return "text-status-warn";
  return "text-status-pass";
}

export function NetworkInspector({ requests }: { requests: NetworkRequest[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const failedCount = requests.filter((r) => r.failed || r.status >= 400).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Globe size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Network inspector</h2>
        <span className="ml-auto text-xs text-slate-500">
          {requests.length} requests
          {failedCount > 0 && <span className="text-status-fail"> - {failedCount} failed</span>}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5 font-semibold">Method</th>
            <th className="px-4 py-2.5 font-semibold">Endpoint</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 font-semibold">Duration</th>
            <th className="w-8 px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.map((req) => {
            const isFailed = req.failed || req.status >= 400;
            const canExpand = Boolean(req.requestPayload || req.responsePayload);
            const isOpen = expanded === req.id;
            return (
              <Fragment key={req.id}>
                <tr
                  className={`cursor-pointer ${isFailed ? "bg-status-failBg/40 hover:bg-status-failBg/60" : "hover:bg-slate-50"}`}
                  onClick={() => canExpand && setExpanded(isOpen ? null : req.id)}
                >
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${methodTone[req.method]}`}>
                      {req.method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{req.endpoint}</td>
                  <td className={`px-4 py-2.5 font-semibold ${statusTone(req.status)}`}>{req.status}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDuration(req.durationMs)}</td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {canExpand && (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
                  </td>
                </tr>
                {isOpen && canExpand && (
                  <tr className="bg-slate-900">
                    <td colSpan={5} className="px-4 py-3">
                      {req.requestPayload && (
                        <div className="mb-2">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Request
                          </div>
                          <pre className="overflow-x-auto rounded bg-slate-800 p-2 font-mono text-xs text-slate-200">
                            {req.requestPayload}
                          </pre>
                        </div>
                      )}
                      {req.responsePayload && (
                        <div>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Response
                          </div>
                          <pre className="overflow-x-auto rounded bg-slate-800 p-2 font-mono text-xs text-slate-200">
                            {req.responsePayload}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
