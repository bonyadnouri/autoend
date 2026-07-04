import { Sparkles, Crosshair, ListTree, Cpu } from "lucide-react";
import type { FailureAnalysis } from "../../types";
import { faultDomainLabel } from "../../data/helpers";
import { ConfidenceMeter } from "./ConfidenceMeter";

const domainTone: Record<string, string> = {
  frontend: "bg-violet-100 text-violet-700",
  backend: "bg-sky-100 text-sky-700",
  network: "bg-amber-100 text-amber-700",
  data: "bg-teal-100 text-teal-700",
  unknown: "bg-slate-100 text-slate-600",
};

export function FailureAnalysisCard({ analysis }: { analysis: FailureAnalysis }) {
  return (
    <section className="card overflow-hidden border-l-4 border-l-status-ai">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-status-aiBg/40 px-5 py-3">
        <Sparkles size={17} className="text-status-ai" />
        <h2 className="text-sm font-semibold text-status-ai">AI failure analysis</h2>
        <span
          className={`pill ml-auto ${domainTone[analysis.faultDomain] ?? domainTone.unknown}`}
        >
          <Cpu size={13} />
          {faultDomainLabel[analysis.faultDomain]} fault
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-start gap-2">
            <Crosshair size={16} className="mt-0.5 shrink-0 text-status-fail" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Likely root cause
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{analysis.rootCause}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{analysis.explanation}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <ConfidenceMeter value={analysis.confidence} />
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <ListTree size={13} /> Suggested next steps
            </div>
            <ol className="mt-2 space-y-1.5">
              {analysis.nextSteps.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-status-ai text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
