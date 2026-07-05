import {
  Layers,
  Route as RouteIcon,
  ListChecks,
  CheckCircle2,
  XCircle,
  Gauge,
  ShieldAlert,
  Play,
  ArrowRight,
  Network,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { MetricCard } from "../components/MetricCard";
import { JourneyStatusBadge } from "../components/StatusBadge";
import { SeverityBadge } from "../components/SeverityBadge";
import { formatDateTime, severityRank } from "../data/helpers";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { roleLabels, useRole } from "../context/RoleContext";

export function Dashboard() {
  const navigate = useNavigate();
  const { role } = useRole();
  const { appSummary, issues, journeys } = useAnalysisData();

  const topIssues = [...issues]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 4);

  const roleFocus: Record<typeof role, string> = {
    qa: "Prioritizing test execution, failures and coverage.",
    developer: "Prioritizing failed scenarios and root-cause context.",
    "product-owner": "Prioritizing journeys, missing features and UX gaps.",
  };

  return (
    <div>
      <PageHeader
        title={`${appSummary.appName} analysis`}
        subtitle={`Analyzed ${formatDateTime(appSummary.analyzedAt)} - viewing as ${roleLabels[role]}. ${roleFocus[role]}`}
        actions={
          <>
            <Link to="/" className="btn-secondary">
              <Network size={16} /> View map
            </Link>
            <button className="btn-primary" onClick={() => navigate("/start")}>
              <Play size={16} /> Start new analysis
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Screens discovered"
          value={appSummary.screensDiscovered}
          icon={Layers}
          hint="Across all entry points"
          onClick={() => navigate("/")}
        />
        <MetricCard
          label="User flows"
          value={appSummary.userFlows}
          icon={RouteIcon}
          hint="End-to-end journeys"
          onClick={() => navigate("/journeys")}
        />
        <MetricCard
          label="Tests executed"
          value={appSummary.testsExecuted}
          icon={ListChecks}
          hint={`${appSummary.testsNotExecuted} not executed`}
          onClick={() => navigate("/tests")}
        />
        <MetricCard
          label="Critical issues"
          value={appSummary.criticalIssues}
          icon={ShieldAlert}
          tone="fail"
          hint="Require immediate attention"
        />
        <MetricCard
          label="Tests passed"
          value={appSummary.testsPassed}
          icon={CheckCircle2}
          tone="pass"
          onClick={() => navigate("/tests")}
        />
        <MetricCard
          label="Tests failed"
          value={appSummary.testsFailed}
          icon={XCircle}
          tone="fail"
          onClick={() => navigate("/tests")}
        />
        <div className="card col-span-2 p-5">
          <div className="flex items-start justify-between">
            <span className="section-title">Coverage</span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-status-aiBg text-status-ai">
              <Gauge size={18} />
            </span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {appSummary.coveragePercent}%
            </span>
            <span className="mb-1 text-sm text-slate-500">of discovered flows tested</span>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${appSummary.coveragePercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">User journeys</h2>
            <Link
              to="/journeys"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-2">
            {journeys.map((j) => (
              <Link
                key={j.id}
                to={`/journeys/${j.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-3 transition-colors hover:border-slate-200 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">{j.name}</div>
                  <div className="text-xs text-slate-500">{j.steps.length} screens - {j.coverage}% coverage</div>
                </div>
                <JourneyStatusBadge status={j.status} />
              </Link>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Top issues</h2>
          </div>
          <div className="space-y-2">
            {topIssues.map((issue) => (
              <Link
                key={issue.id}
                to={`/issues/${issue.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 transition-colors hover:border-slate-200 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{issue.title}</div>
                  <div className="text-xs text-slate-500">{issue.id}</div>
                </div>
                <SeverityBadge severity={issue.severity} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
