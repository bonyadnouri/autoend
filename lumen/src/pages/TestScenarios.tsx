import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, RotateCcw, Search } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { TestStatusBadge } from "../components/StatusBadge";
import { formatDuration } from "../data/helpers";
import type { TestStatus } from "../types";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { useRole } from "../context/RoleContext";

type StatusFilter = "all" | TestStatus;

export function TestScenarios() {
  const { role } = useRole();
  const { journeys, tests, getInvestigation, getJourney, appSummary } = useAnalysisData();
  const [status, setStatus] = useState<StatusFilter>(
    role === "developer" ? "fail" : "all",
  );
  const [journeyId, setJourneyId] = useState<string>("all");

  const filtered = useMemo(
    () =>
      tests.filter(
        (t) =>
          (status === "all" || t.status === status) &&
          (journeyId === "all" || t.journeyId === journeyId),
      ),
    [status, journeyId, tests],
  );

  const counts = {
    all: tests.length,
    pass: tests.filter((t) => t.status === "pass").length,
    fail: tests.filter((t) => t.status === "fail").length,
    warning: tests.filter((t) => t.status === "warning").length,
    "not-executed": tests.filter((t) => t.status === "not-executed").length,
  };

  return (
    <div>
      <PageHeader
        title="Test Scenarios"
        subtitle={`AI-generated scenarios executed against ${appSummary.appName}, grouped by journey with pass/fail status.`}
        backTo="/"
        actions={
          <button className="btn-secondary" onClick={() => alert("Re-running all scenarios (mock)")}>
            <RotateCcw size={16} /> Re-run all
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip label="All" count={counts.all} active={status === "all"} onClick={() => setStatus("all")} />
        <FilterChip
          label="Passed"
          count={counts.pass}
          active={status === "pass"}
          onClick={() => setStatus("pass")}
          icon={<CheckCircle2 size={14} className="text-status-pass" />}
        />
        <FilterChip
          label="Failed"
          count={counts.fail}
          active={status === "fail"}
          onClick={() => setStatus("fail")}
          icon={<XCircle size={14} className="text-status-fail" />}
        />
        <FilterChip
          label="Warning"
          count={counts.warning}
          active={status === "warning"}
          onClick={() => setStatus("warning")}
          icon={<AlertTriangle size={14} className="text-status-warn" />}
        />
        <FilterChip
          label="Not executed"
          count={counts["not-executed"]}
          active={status === "not-executed"}
          onClick={() => setStatus("not-executed")}
          icon={<MinusCircle size={14} className="text-status-idle" />}
        />

        <div className="ml-auto">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            value={journeyId}
            onChange={(e) => setJourneyId(e.target.value)}
          >
            <option value="all">All journeys</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Scenario</th>
              <th className="px-4 py-3 font-semibold">Journey</th>
              <th className="px-4 py-3 font-semibold">Duration</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <tr key={t.id} className="group hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/tests/${t.id}`} className="block">
                    <div className="break-words font-semibold text-slate-800 group-hover:text-brand-700">
                      {t.name}
                    </div>
                    <div className="break-all text-xs text-slate-400">{t.id}</div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="break-words">{getJourney(t.journeyId)?.name}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDuration(t.durationMs)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <TestStatusBadge status={t.status} />
                    {getInvestigation(t.id) && (
                      <Link
                        to={`/tests/${t.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 opacity-0 transition-opacity hover:text-brand-700 group-hover:opacity-100"
                      >
                        <Search size={13} /> Investigate
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No scenarios match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
      <span
        className={`rounded-full px-1.5 text-xs font-semibold ${
          active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
