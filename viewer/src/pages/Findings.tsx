import { Link } from "react-router-dom";
import { Video } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { KindBadge } from "../components/StatusBadge";
import { useReport } from "../data/report";
import type { FindingKind } from "../types";

const tierRank: Record<FindingKind, number> = {
  "hard-failure": 0,
  regression: 1,
  advisory: 2,
};

export function Findings() {
  const { artifact } = useReport();
  const findings = [...artifact.findings].sort((a, b) => tierRank[a.kind] - tierRank[b.kind]);
  const flowTitle = (flowId?: string) =>
    flowId ? artifact.flows.find((f) => f.id === flowId) : undefined;

  return (
    <div>
      <PageHeader
        title="Findings"
        subtitle="Everything this Run flagged for your attention."
        backTo="/"
      />

      {findings.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          This Run produced no Findings.
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Kind</th>
                  <th className="px-4 py-2.5 font-semibold">Finding</th>
                  <th className="px-4 py-2.5 font-semibold">Flow</th>
                  <th className="px-4 py-2.5 font-semibold">Evidence</th>
                  <th className="px-4 py-2.5 font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {findings.map((f) => {
                  const flow = flowTitle(f.flowId);
                  return (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-top">
                        <KindBadge kind={f.kind} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/findings/${f.id}`}
                          className={`text-sm font-semibold hover:text-brand-700 ${
                            f.resolution
                              ? "text-slate-400 line-through"
                              : "text-slate-800"
                          }`}
                        >
                          {f.title}
                        </Link>
                        <div className="text-xs text-slate-400">
                          {f.id}
                          {f.resolution && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">
                              {f.resolution}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {flow ? (
                          <Link
                            to={`/flows/${flow.id}`}
                            className="text-xs font-medium text-brand-600 hover:text-brand-700"
                          >
                            {flow.title}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {f.evidence ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-ai">
                            <Video size={13} /> Video
                          </span>
                        ) : (
                          <span
                            className="inline-block h-2 w-2 rounded-full bg-slate-200"
                            aria-label="No evidence"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {f.diagnosis ? (
                          <span className="font-semibold text-status-ai">
                            {f.diagnosis.confidence}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
