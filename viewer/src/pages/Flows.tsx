import { Link } from "react-router-dom";
import { Route as RouteIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { FlowStatusBadge } from "../components/StatusBadge";
import { useReport } from "../data/report";
import { formatDateTime, formatDuration } from "../data/helpers";

export function Flows() {
  const { artifact } = useReport();

  return (
    <div>
      <PageHeader
        title="Flows"
        subtitle="Every Flow this Run touched — replayed from the Flow Map or newly discovered."
        backTo="/"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {artifact.flows.map((flow) => {
          const linked = artifact.findings.filter((f) => f.flowId === flow.id);
          const steps = flow.timeline?.length ?? 0;
          const when =
            flow.status === "discovered"
              ? `Discovered ${formatDateTime(flow.discoveredAt)}`
              : flow.lastPassedAt
                ? `Last passed ${formatDateTime(flow.lastPassedAt)}`
                : `Discovered ${formatDateTime(flow.discoveredAt)}`;

          return (
            <Link key={flow.id} to={`/flows/${flow.id}`} className="card card-hover flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <RouteIcon size={20} />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{flow.title}</h2>
                    <p className="text-xs text-slate-500">{when}</p>
                  </div>
                </div>
                <FlowStatusBadge status={flow.status} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>{steps} steps</span>
                {flow.durationMs != null && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{formatDuration(flow.durationMs)}</span>
                  </>
                )}
                {linked.length > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="font-medium text-status-fail">
                      {linked.length} {linked.length === 1 ? "Finding" : "Findings"}
                    </span>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
