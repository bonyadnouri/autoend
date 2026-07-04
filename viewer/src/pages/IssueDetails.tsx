import { Link, useParams } from "react-router-dom";
import {
  Lightbulb,
  Layers,
  Route as RouteIcon,
  ListChecks,
  Wrench,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { TestStatusBadge } from "../components/StatusBadge";
import { ScreenshotPlaceholder } from "../components/ScreenshotPlaceholder";
import { NotFound } from "./NotFound";
import { getIssue, getJourney, getScreen, getTest } from "../data/helpers";

const statusLabel: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-status-failBg text-status-fail" },
  acknowledged: { label: "Acknowledged", cls: "bg-status-warnBg text-status-warn" },
  resolved: { label: "Resolved", cls: "bg-status-passBg text-status-pass" },
};

export function IssueDetails() {
  const { id } = useParams();
  const issue = id ? getIssue(id) : undefined;
  if (!issue) return <NotFound />;

  const screen = getScreen(issue.relatedScreenId);
  const journey = issue.relatedJourneyId ? getJourney(issue.relatedJourneyId) : undefined;
  const relatedTests = issue.relatedTestIds.map(getTest).filter((t) => t);
  const st = statusLabel[issue.status];

  return (
    <div>
      <PageHeader
        title={issue.title}
        subtitle={`${issue.id} - detected on the ${screen?.name} screen`}
        backTo={-1}
        actions={<span className={`pill ${st.cls}`}>{st.label}</span>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <span className="section-title">Description</span>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{issue.description}</p>
          </section>

          <section className="card border-l-4 border-l-status-ai p-5">
            <div className="flex items-center gap-2">
              <Lightbulb size={17} className="text-status-ai" />
              <span className="text-sm font-semibold text-status-ai">Suggested fix</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{issue.suggestedFix}</p>
          </section>

          <section className="card p-5">
            <span className="section-title">Screenshot</span>
            <div className="mt-3">
              {screen && <ScreenshotPlaceholder name={screen.name} accent={screen.accent} />}
            </div>
          </section>

          {relatedTests.length > 0 && (
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <ListChecks size={17} className="text-slate-400" />
                <h2 className="text-base font-semibold text-slate-900">Related test cases</h2>
              </div>
              <div className="space-y-2">
                {relatedTests.map((t) => (
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
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <span className="section-title">Context</span>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Wrench size={13} /> Impact
              </div>
              {screen && (
                <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <Layers size={15} className="text-slate-400" /> {screen.name}
                  </span>
                </div>
              )}
              {journey && (
                <Link
                  to={`/journeys/${journey.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 hover:border-slate-200 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <RouteIcon size={15} className="text-slate-400" /> {journey.name}
                  </span>
                  <ArrowRight size={15} className="text-slate-400" />
                </Link>
              )}
            </div>
          </section>

          <section className="card p-5">
            <span className="section-title">Attributes</span>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <span className={`pill ${st.cls}`}>{st.label}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Issue ID</dt>
                <dd className="font-medium text-slate-800">{issue.id}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
