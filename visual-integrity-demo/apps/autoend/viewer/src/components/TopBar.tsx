import { Globe, Gauge, CheckCircle2, AlertOctagon } from "lucide-react";
import { useReport } from "../data/report";

export function TopBar() {
  const { artifact } = useReport();
  const failures = artifact.findings.filter((f) => f.kind === "hard-failure").length;
  const regressions = artifact.findings.filter((f) => f.kind === "regression").length;
  const allClear = failures + regressions === 0;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6">
      <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
        <Globe size={16} className="shrink-0 text-slate-400" />
        <span className="truncate font-medium text-slate-800">{artifact.target}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="pill bg-slate-100 text-slate-600">
          <Gauge size={13} /> Effort: {artifact.effort}
        </span>
        {allClear ? (
          <span className="pill bg-status-passBg text-status-pass">
            <CheckCircle2 size={13} /> All clear
          </span>
        ) : (
          <span className="pill bg-status-failBg text-status-fail">
            <AlertOctagon size={13} />
            {failures} hard {failures === 1 ? "failure" : "failures"}, {regressions}{" "}
            {regressions === 1 ? "regression" : "regressions"}
          </span>
        )}
      </div>
    </header>
  );
}
