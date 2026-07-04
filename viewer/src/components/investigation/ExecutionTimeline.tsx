import { CheckCircle2, XCircle, GitCommitHorizontal } from "lucide-react";
import type { StepResult } from "../../types";
import { formatClock } from "../../data/helpers";

/** Retyped to StepResult[] for the real schema; Task 5 wires it into FindingDetails. */
export function ExecutionTimeline({ timeline }: { timeline: StepResult[] }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <GitCommitHorizontal size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Timeline</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2">
        {timeline.map((step, i) => {
          const failed = step.status === "failed";
          const Icon = failed ? XCircle : CheckCircle2;
          return (
            <div
              key={i}
              className="w-40 shrink-0 rounded-lg border border-slate-200 bg-white p-3"
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                  failed ? "bg-status-failBg text-status-fail" : "bg-status-passBg text-status-pass"
                }`}
              >
                <Icon size={15} />
              </span>
              <div className="mt-2 truncate text-xs font-semibold text-slate-800">{step.label}</div>
              <div className="mt-1 font-mono text-[10px] text-slate-400">{formatClock(step.tMs)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
