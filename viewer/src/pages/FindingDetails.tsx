import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Route as RouteIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { KindBadge } from "../components/StatusBadge";
import { ResolutionActions, type ResolutionAction } from "../components/ResolutionActions";
import { ReplayPlayer, type ReplayPlayerHandle } from "../components/investigation/ReplayPlayer";
import { FailureAnalysisCard } from "../components/investigation/FailureAnalysisCard";
import { ExecutionTimeline } from "../components/investigation/ExecutionTimeline";
import { EvidencePackage } from "../components/investigation/EvidencePackage";
import { LogPanel } from "../components/investigation/LogPanel";
import { NetworkInspector } from "../components/investigation/NetworkInspector";
import { EnvironmentDetails } from "../components/investigation/EnvironmentDetails";
import { ExportMenu } from "../components/investigation/ExportMenu";
import { NotFound } from "./NotFound";
import { useReport } from "../data/report";
import type { FindingKind } from "../types";

/** Which resolution action a Finding tier offers (CONTEXT.md); hard failures have none. */
const resolutionFor: Partial<Record<FindingKind, ResolutionAction>> = {
  regression: "dismiss",
  advisory: "suppress",
};

export function FindingDetails() {
  const { id } = useParams();
  const { artifact, capabilities } = useReport();
  const finding = artifact.findings.find((f) => f.id === id);
  const playerRef = useRef<ReplayPlayerHandle>(null);
  const [resolution, setResolution] = useState(finding?.resolution);

  if (!finding) return <NotFound />;

  const flow = finding.flowId
    ? artifact.flows.find((f) => f.id === finding.flowId)
    : undefined;

  const seek = (ms: number) => playerRef.current?.seekTo(ms);
  const action = resolutionFor[finding.kind];
  const showResolve = action && !resolution && capabilities.resolutionActions;

  function handleResolved(next: NonNullable<typeof resolution>) {
    if (finding) finding.resolution = next; // reflect in the list views on revisit
    setResolution(next);
  }

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
        actions={
          <>
            <KindBadge kind={finding.kind} />
            {resolution && (
              <span className="pill bg-slate-100 capitalize text-slate-600">{resolution}</span>
            )}
            <ExportMenu
              finding={finding}
              runId={artifact.runId}
              target={artifact.target}
              environment={artifact.environment}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <span className="section-title">Detail</span>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{finding.detail}</p>
          </section>

          {finding.evidence && <ReplayPlayer ref={playerRef} file={finding.evidence} />}

          {finding.diagnosis && <FailureAnalysisCard diagnosis={finding.diagnosis} />}

          {finding.timeline && finding.timeline.length > 0 && (
            <ExecutionTimeline timeline={finding.timeline} onSeek={seek} />
          )}

          {finding.screenshots && finding.screenshots.length > 0 && (
            <EvidencePackage screenshots={finding.screenshots} onSeek={seek} />
          )}

          {finding.console && finding.console.length > 0 && <LogPanel logs={finding.console} />}

          {finding.network && finding.network.length > 0 && (
            <NetworkInspector requests={finding.network} />
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <span className="section-title">Metadata</span>
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
              {resolution && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Resolution</dt>
                  <dd>
                    <span className="pill bg-slate-100 capitalize text-slate-600">{resolution}</span>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {showResolve && (
            <section className="card p-5">
              <span className="section-title">Resolve</span>
              <div className="mt-3">
                <ResolutionActions id={finding.id} action={action} onResolved={handleResolved} />
              </div>
            </section>
          )}

          <EnvironmentDetails env={artifact.environment} startedAt={artifact.startedAt} />
        </div>
      </div>
    </div>
  );
}
