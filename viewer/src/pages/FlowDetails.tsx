import { Link, useParams } from "react-router-dom";
import { ListChecks, CheckCircle2, XCircle, Video, Wand2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { FlowStatusBadge, KindBadge } from "../components/StatusBadge";
import { ResolutionActions } from "../components/ResolutionActions";
import { NotFound } from "./NotFound";
import { useReport, evidenceUrl } from "../data/report";
import { formatClock, formatDateTime, formatDuration } from "../data/helpers";

export function FlowDetails() {
  const { id } = useParams();
  const { artifact } = useReport();
  const flow = artifact.flows.find((f) => f.id === id);
  if (!flow) return <NotFound />;

  const timeline = flow.timeline ?? [];
  const linked = artifact.findings.filter((f) => f.flowId === flow.id);
  const heal = artifact.heals.find((h) => h.flowId === flow.id);

  return (
    <div>
      <PageHeader
        title={flow.title}
        backTo="/flows"
        actions={<FlowStatusBadge status={flow.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {flow.evidence && (
            <section className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                <Video size={16} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">Evidence</h2>
              </div>
              <video
                src={evidenceUrl(flow.evidence)}
                controls
                className="aspect-video w-full bg-black"
              />
            </section>
          )}

          {heal && (
            <section className="card border-l-4 border-l-status-ai p-5">
              <div className="mb-2 flex items-center gap-2">
                <Wand2 size={17} className="text-status-ai" />
                <h2 className="text-base font-semibold text-slate-900">Heal</h2>
                <span className="pill bg-status-aiBg text-status-ai">Verify this</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">{heal.summary}</p>
              <div className="mt-3">
                <ResolutionActions id={heal.flowId} action="reject" />
              </div>
            </section>
          )}

          <section className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ListChecks size={17} className="text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900">Timeline</h2>
            </div>
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No timeline was recorded for this Flow.</p>
            ) : (
              <ol className="space-y-1">
                {timeline.map((step, i) => {
                  const failed = step.status === "failed";
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5"
                    >
                      {failed ? (
                        <XCircle size={16} className="shrink-0 text-status-fail" />
                      ) : (
                        <CheckCircle2 size={16} className="shrink-0 text-status-pass" />
                      )}
                      <span
                        className={`flex-1 text-sm font-medium ${
                          failed ? "text-status-fail" : "text-slate-800"
                        }`}
                      >
                        {step.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatClock(step.tMs)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <span className="section-title">Details</span>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Status" value={<FlowStatusBadge status={flow.status} />} />
              {flow.durationMs != null && (
                <Row label="Duration" value={formatDuration(flow.durationMs)} />
              )}
              <Row label="Discovered" value={formatDateTime(flow.discoveredAt)} />
              {flow.lastPassedAt && (
                <Row label="Last passed" value={formatDateTime(flow.lastPassedAt)} />
              )}
            </dl>
          </section>

          {linked.length > 0 && (
            <section className="card p-5">
              <span className="section-title">Findings</span>
              <div className="mt-3 space-y-2">
                {linked.map((f) => (
                  <Link
                    key={f.id}
                    to={`/findings/${f.id}`}
                    className="block rounded-lg border border-slate-100 px-3 py-3 hover:border-slate-200 hover:bg-slate-50"
                  >
                    <KindBadge kind={f.kind} />
                    <div className="mt-1.5 text-sm font-semibold text-slate-800">{f.title}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
