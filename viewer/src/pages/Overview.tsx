import { Link, useNavigate } from "react-router-dom";
import {
  XCircle,
  TrendingDown,
  Lightbulb,
  Wand2,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { MetricCard } from "../components/MetricCard";
import { KindBadge } from "../components/StatusBadge";
import { ResolutionActions } from "../components/ResolutionActions";
import { useReport } from "../data/report";
import { formatDateTime, formatDuration, TIER_RANK } from "../data/helpers";

export function Overview() {
  const { artifact } = useReport();
  const navigate = useNavigate();

  const failures = artifact.findings.filter((f) => f.kind === "hard-failure").length;
  const regressions = artifact.findings.filter((f) => f.kind === "regression").length;
  const advisories = artifact.findings.filter((f) => f.kind === "advisory").length;
  const allClear = failures + regressions === 0;

  const durationMs = artifact.finishedAt
    ? new Date(artifact.finishedAt).getTime() - new Date(artifact.startedAt).getTime()
    : 0;

  const env = artifact.environment;
  const topFindings = [...artifact.findings]
    .sort((a, b) => TIER_RANK[a.kind] - TIER_RANK[b.kind])
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Run Report"
        subtitle={`${artifact.flowsReplayed} Flows replayed · ${artifact.flowsDiscovered} discovered`}
      />

      <section
        className={`card mb-6 flex items-center gap-4 p-5 ${
          allClear
            ? "border-status-pass/30 bg-status-passBg/40"
            : "border-status-fail/30 bg-status-failBg/40"
        }`}
      >
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
            allClear ? "bg-status-passBg text-status-pass" : "bg-status-failBg text-status-fail"
          }`}
        >
          {allClear ? <CheckCircle2 size={22} /> : <AlertOctagon size={22} />}
        </span>
        <div>
          <div
            className={`text-lg font-bold ${allClear ? "text-status-pass" : "text-status-fail"}`}
          >
            {allClear
              ? "All clear"
              : `${failures} hard ${failures === 1 ? "failure" : "failures"}, ${regressions} ${
                  regressions === 1 ? "regression" : "regressions"
                }`}
          </div>
          <p className="text-sm text-slate-600">
            {allClear
              ? "No hard failures or regressions in this Run."
              : "These Findings need your attention."}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Hard Failures"
          value={failures}
          icon={XCircle}
          tone="fail"
          onClick={() => navigate("/findings")}
        />
        <MetricCard
          label="Regressions"
          value={regressions}
          icon={TrendingDown}
          tone="warn"
          onClick={() => navigate("/findings")}
        />
        <MetricCard
          label="Advisories"
          value={advisories}
          icon={Lightbulb}
          tone="ai"
          onClick={() => navigate("/findings")}
        />
        <MetricCard label="Heals" value={artifact.heals.length} icon={Wand2} hint="Verify these" />
      </div>

      <section className="card mt-6 p-5">
        <span className="section-title">Run details</span>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          <Meta label="Target" value={artifact.target} />
          <Meta label="Effort" value={artifact.effort} />
          <Meta label="Started" value={formatDateTime(artifact.startedAt)} />
          <Meta label="Duration" value={durationMs > 0 ? formatDuration(durationMs) : "-"} />
          <Meta label="Browser" value={env.browser} />
          <Meta label="Environment" value={`${env.viewport} · ${env.os} · Node ${env.node}`} />
        </dl>
      </section>

      <section className="card mt-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Findings</h2>
          <Link
            to="/findings"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {topFindings.length === 0 ? (
          <p className="text-sm text-slate-500">This Run produced no Findings.</p>
        ) : (
          <div className="space-y-2">
            {topFindings.map((f) => (
              <Link
                key={f.id}
                to={`/findings/${f.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 transition-colors hover:border-slate-200 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div
                    className={`truncate text-sm font-semibold text-slate-800 ${
                      f.resolution ? "text-slate-400 line-through" : ""
                    }`}
                  >
                    {f.title}
                  </div>
                  <div className="text-xs text-slate-500">{f.id}</div>
                </div>
                <KindBadge kind={f.kind} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {artifact.heals.length > 0 && (
        <section className="card mt-6 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wand2 size={17} className="text-status-ai" />
            <h2 className="text-base font-semibold text-slate-900">Heals</h2>
            <span className="pill bg-status-aiBg text-status-ai">Verify these</span>
          </div>
          <div className="space-y-3">
            {artifact.heals.map((heal, i) => {
              const flow = artifact.flows.find((f) => f.id === heal.flowId);
              return (
                <div key={i} className="rounded-lg border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-800">
                      {flow?.title ?? heal.flowId}
                    </div>
                    {flow && (
                      <Link
                        to={`/flows/${heal.flowId}`}
                        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Watch Evidence <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{heal.summary}</p>
                  <div className="mt-3">
                    <ResolutionActions id={heal.flowId} action="reject" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-800">{value}</dd>
    </div>
  );
}
