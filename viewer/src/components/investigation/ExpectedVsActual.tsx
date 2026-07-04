import { Check, X, GitCompareArrows } from "lucide-react";
import type { ExpectedActualRow } from "../../types";

export function ExpectedVsActual({ rows }: { rows: ExpectedActualRow[] }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <GitCompareArrows size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Expected vs actual</h2>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-status-pass/30 bg-status-passBg/40 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-pass">
                <Check size={13} /> Expected
              </div>
              <p className="mt-1 text-sm text-slate-700">{row.expected}</p>
            </div>
            <div className="rounded-lg border border-status-fail/30 bg-status-failBg/40 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-fail">
                <X size={13} /> Actual
              </div>
              <p className="mt-1 text-sm text-slate-700">{row.actual}</p>
            </div>
            <div className="md:col-span-2 -mt-1 text-xs font-medium text-slate-400">
              {row.aspect}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
