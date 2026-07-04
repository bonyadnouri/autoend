import { Camera } from "lucide-react";
import type { Screenshot } from "../../types";
import { formatClock } from "../../data/helpers";
import { evidenceUrl } from "../../data/report";

const labelTone: Record<Screenshot["label"], string> = {
  before: "bg-slate-100 text-slate-600",
  after: "bg-status-aiBg text-status-ai",
  "at-failure": "bg-status-failBg text-status-fail",
};

const labelText: Record<Screenshot["label"], string> = {
  before: "Before",
  after: "After",
  "at-failure": "At failure",
};

/** The still frames captured around a Finding; clicking one seeks the Evidence video. */
export function EvidencePackage({
  screenshots,
  onSeek,
}: {
  screenshots: Screenshot[];
  onSeek?: (ms: number) => void;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Camera size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Screenshots</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {screenshots.map((shot, i) => (
          <button key={i} onClick={() => onSeek?.(shot.tMs)} className="group text-left">
            <div className="mb-2 flex items-center justify-between">
              <span className={`pill ${labelTone[shot.label]}`}>{labelText[shot.label]}</span>
              <span className="font-mono text-[10px] text-slate-400">{formatClock(shot.tMs)}</span>
            </div>
            <img
              src={evidenceUrl(shot.file)}
              alt={labelText[shot.label]}
              className="w-full rounded-lg border border-slate-200 ring-1 ring-transparent transition-all group-hover:ring-brand-200"
            />
          </button>
        ))}
      </div>
    </section>
  );
}
