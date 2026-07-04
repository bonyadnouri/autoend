import { Link } from "react-router-dom";
import { ArrowRight, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { JourneyStatusBadge } from "../components/StatusBadge";
import { journeys, tests } from "../data/mockData";
import { getScreen } from "../data/helpers";

export function Journeys() {
  return (
    <div>
      <PageHeader
        title="User Journeys"
        subtitle="End-to-end flows the AI reconstructed from the navigation graph, with coverage and generated scenarios."
        backTo="/"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {journeys.map((j) => {
          const journeyTests = tests.filter((t) => t.journeyId === j.id);
          const failing = journeyTests.filter((t) => t.status === "fail").length;
          return (
            <Link
              key={j.id}
              to={`/journeys/${j.id}`}
              className="card card-hover flex flex-col p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <RouteIcon size={20} />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{j.name}</h2>
                    <p className="text-xs text-slate-500">{j.steps.length} screens</p>
                  </div>
                </div>
                <JourneyStatusBadge status={j.status} />
              </div>

              <p className="mt-3 text-sm text-slate-600">{j.description}</p>

              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {j.steps.map((step, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {getScreen(step.screenId)?.name}
                    </span>
                    {i < j.steps.length - 1 && <ArrowRight size={12} className="text-slate-300" />}
                  </span>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Coverage</span>
                  <span className="font-semibold text-slate-700">{j.coverage}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${j.coverage}%` }} />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {journeyTests.length} scenarios
                  {failing > 0 && <span className="text-status-fail"> - {failing} failing</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
