import { Link, useParams } from "react-router-dom";
import { RotateCcw, ClipboardList, ShieldAlert } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { TestStatusBadge } from "../components/StatusBadge";
import { ConfidenceMeter } from "../components/investigation/ConfidenceMeter";
import { InvestigationView } from "../components/investigation/InvestigationView";
import { EnvironmentDetails } from "../components/investigation/EnvironmentDetails";
import { ExportMenu } from "../components/investigation/ExportMenu";
import { NotFound } from "./NotFound";
import {
  formatDuration,
  getInvestigation,
  getIssue,
  getJourney,
  getScreen,
  getTest,
} from "../data/helpers";

export function TestDetails() {
  const { id } = useParams();
  const test = id ? getTest(id) : undefined;
  if (!test) return <NotFound />;

  const journey = getJourney(test.journeyId);
  const relatedIssues = test.relatedIssueIds.map(getIssue).filter((i) => i);
  const failed = test.status === "fail";
  const investigation = getInvestigation(test.id);
  const showInvestigation = Boolean(investigation);
  const analysis = investigation?.analysis;

  return (
    <div>
      <PageHeader
        title={test.name}
        subtitle={
          showInvestigation
            ? `${test.id} - investigation ${failed ? "workspace" : `(recorded: ${investigation!.recordedReason})`}`
            : `${test.id} - part of the ${journey?.name} journey`
        }
        backTo={-1}
        actions={
          <>
            <TestStatusBadge status={test.status} />
            {analysis && <ConfidenceMeter value={analysis.confidence} size="sm" />}
            <button className="btn-secondary" onClick={() => alert(`Re-running ${test.id} (mock)`)}>
              <RotateCcw size={16} /> Re-run
            </button>
            {investigation && <ExportMenu test={test} investigation={investigation} />}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {showInvestigation && investigation ? (
            <InvestigationView investigation={investigation} />
          ) : (
            <>
              <section className="card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ClipboardList size={17} className="text-slate-400" />
                  <h2 className="text-base font-semibold text-slate-900">Steps</h2>
                </div>
                <ol className="space-y-3">
                  {test.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                        {i + 1}
                      </span>
                      <div className="flex-1 rounded-lg border border-slate-100 p-3">
                        <div className="text-sm font-medium text-slate-800">{step.action}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          <span className="font-semibold text-slate-400">Expected:</span>{" "}
                          {step.expected}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <section className="card p-5">
                  <span className="section-title">Expected result</span>
                  <p className="mt-2 text-sm text-slate-700">{test.expectedResult}</p>
                </section>
                <section
                  className={`card p-5 ${failed ? "border-status-fail/30 bg-status-failBg/30" : ""}`}
                >
                  <span className="section-title">Actual result</span>
                  <p className={`mt-2 text-sm ${failed ? "text-status-fail" : "text-slate-700"}`}>
                    {test.actualResult || "Not executed yet."}
                  </p>
                </section>
              </div>
            </>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <span className="section-title">Details</span>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Status" value={<TestStatusBadge status={test.status} />} />
              <Row label="Duration" value={formatDuration(test.durationMs)} />
              <Row
                label="Journey"
                value={
                  <Link
                    to={`/journeys/${test.journeyId}`}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    {journey?.name}
                  </Link>
                }
              />
            </dl>
          </section>

          {investigation && <EnvironmentDetails env={investigation.environment} />}

          <section className="card p-5">
            <span className="section-title">Preconditions</span>
            <ul className="mt-2 space-y-1.5">
              {test.preconditions.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  {p}
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <span className="section-title">Screens covered</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {test.screenIds.map((sid) => (
                <span
                  key={sid}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                >
                  {getScreen(sid)?.name}
                </span>
              ))}
            </div>
          </section>

          {relatedIssues.length > 0 && (
            <section className="card p-5">
              <div className="flex items-center gap-2">
                <ShieldAlert size={17} className="text-slate-400" />
                <span className="section-title">Related issues</span>
              </div>
              <div className="mt-3 space-y-2">
                {relatedIssues.map((issue) => (
                  <Link
                    key={issue!.id}
                    to={`/issues/${issue!.id}`}
                    className="block rounded-lg border border-slate-100 px-3 py-3 hover:border-slate-200 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-400">{issue!.id}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{issue!.title}</div>
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
