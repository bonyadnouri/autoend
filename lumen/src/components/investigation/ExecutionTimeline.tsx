import { ChevronRight, Navigation, MousePointerClick, CheckCircle2, XCircle, GitCommitHorizontal } from "lucide-react";
import type { TimelineKind, TimelineStep } from "../../types";
import { formatClock } from "../../data/helpers";
import { useAnalysisData } from "../../context/AnalysisDataContext";

interface Props {
  timeline: TimelineStep[];
  playheadMs: number;
  onSeek: (ms: number) => void;
}

const kindIcon: Record<TimelineKind, typeof Navigation> = {
  navigate: Navigation,
  action: MousePointerClick,
  assertion: CheckCircle2,
  failure: XCircle,
};

const kindTone: Record<TimelineKind, string> = {
  navigate: "text-slate-500 bg-slate-100",
  action: "text-status-ai bg-status-aiBg",
  assertion: "text-status-warn bg-status-warnBg",
  failure: "text-status-fail bg-status-failBg",
};

export function ExecutionTimeline({ timeline, playheadMs, onSeek }: Props) {
  const { getScreen } = useAnalysisData();
  const activeIndex = timeline.reduce((acc, s, i) => (s.tMs <= playheadMs ? i : acc), 0);

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <GitCommitHorizontal size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Execution timeline</h2>
        <span className="text-xs text-slate-400">Click a step to jump the replay</span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2">
        {timeline.map((step, i) => {
          const Icon = kindIcon[step.kind];
          const active = i === activeIndex;
          const screen = getScreen(step.screenId);
          return (
            <div key={i} className="flex items-center">
              <button
                onClick={() => onSeek(step.tMs)}
                className={`w-40 shrink-0 rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${kindTone[step.kind]}`}
                >
                  <Icon size={15} />
                </span>
                <div className="mt-2 truncate text-xs font-semibold text-slate-800">
                  {screen?.name}
                </div>
                <div className="truncate text-xs text-slate-500">{step.label}</div>
                <div className="mt-1 font-mono text-[10px] text-slate-400">
                  {formatClock(step.tMs)}
                </div>
              </button>
              {i < timeline.length - 1 && (
                <ChevronRight size={16} className="mx-0.5 shrink-0 text-slate-300" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
