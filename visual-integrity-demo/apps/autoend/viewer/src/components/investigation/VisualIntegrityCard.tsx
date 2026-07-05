import { ExternalLink, ScanEye } from "lucide-react";
import type { VisualComparison } from "../../types";
import { VisualComparePanel } from "./VisualComparePanel";

/** Visual Integrity panel for Finding details (plan: viewer-panel MVP). */
export function VisualIntegrityCard({ visual }: { visual: VisualComparison }) {
  const violation = visual.violations?.[0];
  const classifier = visual.classifier;
  const modelDisagrees = classifier?.classification === "likely-intentional";
  const hasCompare =
    visual.expectedFile || visual.baselineFile || visual.diffFile || (visual.overlays?.length ?? 0) > 0;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanEye size={17} className="text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Visual integrity</h2>
        </div>
        {visual.violations && (
          <a
            href="evidence/visual/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Full report <ExternalLink size={14} />
          </a>
        )}
      </div>

      {violation && (
        <dl className="mb-4 space-y-2 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rule</dt>
            <dd className="font-mono text-slate-800">{violation.ruleId}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Expected</dt>
            <dd className="text-slate-700">{violation.expected}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actual</dt>
            <dd className="text-slate-700">{violation.actual}</dd>
          </div>
        </dl>
      )}

      {hasCompare ? (
        <VisualComparePanel visual={visual} />
      ) : (
        <img
          src={`evidence/${visual.actualFile}`}
          alt="Visual capture at time of check"
          className="mb-4 w-full rounded-lg border border-slate-200"
        />
      )}

      {classifier && (
        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            modelDisagrees ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
          }`}
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">AI review</p>
          {modelDisagrees && (
            <p className="mb-2 text-amber-800">
              Model judgment differs from deterministic rules — the rule violation above is the source of truth.
            </p>
          )}
          <p className="text-slate-700">{classifier.summary}</p>
          {classifier.rationale && <p className="mt-2 text-slate-500">{classifier.rationale}</p>}
        </div>
      )}
    </section>
  );
}
