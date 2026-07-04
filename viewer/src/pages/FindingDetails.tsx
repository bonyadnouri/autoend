import { Link, useParams } from "react-router-dom";
import { Video, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { KindBadge } from "../components/StatusBadge";
import { FailureAnalysisCard } from "../components/investigation/FailureAnalysisCard";
import { NotFound } from "./NotFound";
import { useReport, evidenceUrl } from "../data/report";

export function FindingDetails() {
  const { id } = useParams();
  const { artifact } = useReport();
  const finding = artifact.findings.find((f) => f.id === id);
  if (!finding) return <NotFound />;

  const flow = finding.flowId
    ? artifact.flows.find((f) => f.id === finding.flowId)
    : undefined;

  return (
    <div>
      <PageHeader
        title={finding.title}
        backTo="/findings"
        breadcrumb={
          <span>
            <Link to="/findings" className="hover:text-slate-700">
              Findings
            </Link>{" "}
            / {finding.id}
          </span>
        }
        actions={<KindBadge kind={finding.kind} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <span className="section-title">Detail</span>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{finding.detail}</p>
          </section>

          {finding.evidence && (
            <section className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                <Video size={16} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">Evidence</h2>
              </div>
              <video
                src={evidenceUrl(finding.evidence)}
                controls
                className="aspect-video w-full bg-black"
              />
            </section>
          )}

          {finding.diagnosis && <FailureAnalysisCard diagnosis={finding.diagnosis} />}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <span className="section-title">Details</span>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Kind</dt>
                <dd>
                  <KindBadge kind={finding.kind} />
                </dd>
              </div>
              {flow && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Flow</dt>
                  <dd className="text-right">
                    <Link
                      to={`/flows/${flow.id}`}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
                    >
                      <RouteIcon size={14} /> {flow.title}
                    </Link>
                  </dd>
                </div>
              )}
              {finding.resolution && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Resolution</dt>
                  <dd>
                    <span className="pill bg-slate-100 capitalize text-slate-600">
                      {finding.resolution}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
