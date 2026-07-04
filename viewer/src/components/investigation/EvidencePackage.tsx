import { Camera } from "lucide-react";
import type { EvidenceShot } from "../../types";
import { getScreen, formatClock } from "../../data/helpers";
import { ScreenshotPlaceholder } from "../ScreenshotPlaceholder";

const labelTone: Record<string, string> = {
  "Before action": "bg-slate-100 text-slate-600",
  "After action": "bg-status-aiBg text-status-ai",
  "At failure": "bg-status-failBg text-status-fail",
};

export function EvidencePackage({
  evidence,
  onSeek,
}: {
  evidence: EvidenceShot[];
  onSeek?: (ms: number) => void;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Camera size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Screenshots</h2>
        <span className="text-xs text-slate-400">Before, after and at the point of failure</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {evidence.map((shot, i) => {
          const screen = getScreen(shot.screenId);
          return (
            <button
              key={i}
              onClick={() => onSeek?.(shot.tMs)}
              className="group text-left"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`pill ${labelTone[shot.label] ?? "bg-slate-100 text-slate-600"}`}>
                  {shot.label}
                </span>
                <span className="font-mono text-[10px] text-slate-400">{formatClock(shot.tMs)}</span>
              </div>
              <div className="overflow-hidden rounded-lg ring-1 ring-transparent transition-all group-hover:ring-brand-200">
                {screen && <ScreenshotPlaceholder name={screen.name} accent={screen.accent} />}
              </div>
              <p className="mt-2 text-xs text-slate-500">{shot.caption}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
