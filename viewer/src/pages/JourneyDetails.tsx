import { Link, useParams } from "react-router-dom";
import { ListChecks } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { JourneyStatusBadge, TestStatusBadge } from "../components/StatusBadge";
import { NotFound } from "./NotFound";
import { getJourney, getScreen, getTest } from "../data/helpers";

export function JourneyDetails() {
  const { id } = useParams();
  const journey = id ? getJourney(id) : undefined;
  if (!journey) return <NotFound />;

  const journeyTests = journey.testCaseIds.map(getTest).filter((t) => t);
  const passed = journeyTests.filter((t) => t!.status === "pass").length;
  const failed = journeyTests.filter((t) => t!.status === "fail").length;

  return (
    <div>
      <PageHeader
        title={journey.name}
        subtitle={journey.description}
        backTo="/journeys"
        breadcrumb={
          <span>
            <Link to="/journeys" className="hover:text-slate-700">
              User Journeys
            </Link>{" "}
            / {journey.name}
          </span>
        }
        actions={<JourneyStatusBadge status={journey.status} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatBox label="Coverage" value={`${journey.coverage}%`} />
        <StatBox label="Screens" value={journey.steps.length} />
        <StatBox label="Passed" value={passed} tone="pass" />
        <StatBox label="Failed" value={failed} tone="fail" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Journey flow</h2>
          <ol className="relative space-y-1">
            {journey.steps.map((step, i) => {
              const screen = getScreen(step.screenId);
              const isLast = i === journey.steps.length - 1;
              return (
                <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {!isLast && (
                    <span className="absolute left-[15px] top-8 h-full w-px bg-slate-200" />
                  )}
                  <span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex-1 rounded-lg border border-slate-100 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">{screen?.name}</span>
                    </div>
                    <p className="text-xs text-slate-500">{step.action}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks size={17} className="text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Test scenarios</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              {journeyTests.length}
            </span>
          </div>
          <div className="space-y-2">
            {journeyTests.map((t) => (
              <Link
                key={t!.id}
                to={`/tests/${t!.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 hover:border-slate-200 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{t!.name}</div>
                  <div className="text-xs text-slate-500">{t!.id}</div>
                </div>
                <TestStatusBadge status={t!.status} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "pass" | "fail";
}) {
  const color =
    tone === "pass" ? "text-status-pass" : tone === "fail" ? "text-status-fail" : "text-slate-900";
  return (
    <div className="card p-4">
      <div className="section-title">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}
