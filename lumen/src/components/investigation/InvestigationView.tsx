import { useEffect, useState } from "react";
import {
  Sparkles,
  Video,
  Camera,
  Globe,
  Terminal,
  GitCompareArrows,
  Package,
} from "lucide-react";
import type { TestInvestigation } from "../../types";
import { FailureAnalysisCard } from "./FailureAnalysisCard";
import { ReplayPlayer } from "./ReplayPlayer";
import { ExecutionTimeline } from "./ExecutionTimeline";
import { ExpectedVsActual } from "./ExpectedVsActual";
import { EvidencePackage } from "./EvidencePackage";
import { NetworkInspector } from "./NetworkInspector";
import { LogPanel } from "./LogPanel";

const TICK_MS = 100;

export function InvestigationView({ investigation }: { investigation: TestInvestigation }) {
  const duration = investigation.replay.durationMs;
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setPlayheadMs((prev) => {
        const next = prev + TICK_MS;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(t);
  }, [playing, duration]);

  function togglePlay() {
    setPlaying((p) => {
      if (!p && playheadMs >= duration) setPlayheadMs(0);
      return !p;
    });
  }

  function seek(ms: number) {
    setPlayheadMs(Math.min(Math.max(0, ms), duration));
  }

  const hasComparison = investigation.comparison.length > 0;

  const summary = [
    { icon: Video, label: "Replay", anchor: "inv-replay" },
    { icon: Camera, label: `${investigation.evidence.length} screenshots`, anchor: "inv-evidence" },
    { icon: Globe, label: `${investigation.network.length} requests`, anchor: "inv-network" },
    { icon: Terminal, label: `${investigation.logs.length} logs`, anchor: "inv-logs" },
    ...(hasComparison
      ? [{ icon: GitCompareArrows, label: "Expected vs actual", anchor: "inv-comparison" }]
      : []),
    ...(investigation.analysis
      ? [{ icon: Sparkles, label: "AI analysis", anchor: "inv-analysis" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="flex items-center gap-2">
          <Package size={17} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-900">Evidence package</h2>
          <span className="ml-2 text-xs text-slate-400">Everything needed to diagnose this failure</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.map((s) => (
            <button
              key={s.anchor}
              onClick={() =>
                document.getElementById(s.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <s.icon size={13} />
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {investigation.analysis && (
        <div id="inv-analysis" className="scroll-mt-4">
          <FailureAnalysisCard analysis={investigation.analysis} />
        </div>
      )}

      <div id="inv-replay" className="scroll-mt-4">
        <ReplayPlayer
          replay={investigation.replay}
          playheadMs={playheadMs}
          playing={playing}
          onTogglePlay={togglePlay}
          onSeek={seek}
        />
      </div>

      <ExecutionTimeline timeline={investigation.timeline} playheadMs={playheadMs} onSeek={seek} />

      {hasComparison && (
        <div id="inv-comparison" className="scroll-mt-4">
          <ExpectedVsActual rows={investigation.comparison} />
        </div>
      )}

      <div id="inv-evidence" className="scroll-mt-4">
        <EvidencePackage evidence={investigation.evidence} onSeek={seek} />
      </div>

      <div id="inv-network" className="scroll-mt-4">
        <NetworkInspector requests={investigation.network} />
      </div>

      <div id="inv-logs" className="scroll-mt-4">
        <LogPanel logs={investigation.logs} />
      </div>
    </div>
  );
}
