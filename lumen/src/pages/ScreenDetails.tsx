import { Link, useParams } from "react-router-dom";
import {
  Type,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { JourneyStatusBadge, TestStatusBadge } from "../components/StatusBadge";
import { SeverityBadge } from "../components/SeverityBadge";
import { ScreenshotPlaceholder } from "../components/ScreenshotPlaceholder";
import { NotFound } from "./NotFound";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { screenIdFromParam } from "../lib/paths";

export function ScreenDetails() {
  const { id } = useParams();
  const screenId = screenIdFromParam(id);
  const { getScreen, getIssue, getTest } = useAnalysisData();
  const screen = screenId ? getScreen(screenId) : undefined;
  if (!screen) return <NotFound />;

  const tests = screen.testCaseIds.map(getTest).filter((t) => t);
  const relatedIssues = screen.issueIds.map(getIssue).filter((i) => i);

  return (
    <div>
      <PageHeader
        title={screen.name}
        subtitle={screen.description}
        backTo="/"
        breadcrumb={
          <span>
            <Link to="/" className="hover:text-slate-700">
              Application Map
            </Link>{" "}
            / {screen.name}
          </span>
        }
        actions={<JourneyStatusBadge status={screen.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <SectionTitle icon={ListChecks} title="Generated test cases" count={tests.length} />
            {tests.length === 0 ? (
              <EmptyRow text="No test cases generated for this screen yet." />
            ) : (
              <div className="mt-3 space-y-2">
                {tests.map((t) => (
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
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <span className="section-title">Screenshot</span>
            <div className="mt-3">
              <ScreenshotPlaceholder name={screen.name} accent={screen.accent} />
            </div>
          </section>

          <section className="card p-5">
            <SectionTitle icon={ShieldAlert} title="Related issues" count={relatedIssues.length} />
            {relatedIssues.length === 0 ? (
              <EmptyRow text="No issues detected on this screen." />
            ) : (
              <div className="mt-3 space-y-2">
                {relatedIssues.map((issue) => (
                  <Link
                    key={issue!.id}
                    to={`/issues/${issue!.id}`}
                    className="block rounded-lg border border-slate-100 px-3 py-3 hover:border-slate-200 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-400">{issue!.id}</span>
                      <SeverityBadge severity={issue!.severity} />
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{issue!.title}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Type;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={17} className="text-slate-400" />
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {count !== undefined && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">{text}</p>;
}
