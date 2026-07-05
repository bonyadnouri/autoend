import { useEffect, useState } from "react";
import { Video, X } from "lucide-react";
import type { Journey, TestInvestigation, TestScenario } from "../types";
import { ReplayPlayer } from "./investigation/ReplayPlayer";

const TICK_MS = 100;
const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2] as const;
const DEFAULT_SPEED = 0.25;

export interface JourneyReplay {
  test: TestScenario;
  investigation: TestInvestigation;
}

interface Props {
  journey: Journey;
  replays: JourneyReplay[];
  onClose: () => void;
}

export function JourneyReplayModal({ journey, replays, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);

  const active = replays[activeIdx] ?? replays[0];
  const duration = active.investigation.replay.durationMs;

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setPlayheadMs((prev) => {
        const next = prev + TICK_MS * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(t);
  }, [playing, duration, speed]);

  function togglePlay() {
    setPlaying((p) => {
      if (!p && playheadMs >= duration) setPlayheadMs(0);
      return !p;
    });
  }

  function seek(ms: number) {
    setPlayheadMs(Math.min(Math.max(0, ms), duration));
  }

  function selectReplay(idx: number) {
    setActiveIdx(idx);
    setPlayheadMs(0);
    setPlaying(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-cardHover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Video size={18} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Journey replay</h3>
              <p className="text-xs text-slate-500">{journey.name}</p>
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600"
            onClick={onClose}
            aria-label="Close replay"
          >
            <X size={18} />
          </button>
        </div>

        {replays.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {replays.map((r, i) => (
              <button
                key={r.test.id}
                type="button"
                onClick={() => selectReplay(i)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === activeIdx
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {r.test.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="text-xs font-medium text-slate-500">Speed</span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSpeed(option)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  speed === option
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {option}x
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <ReplayPlayer
            key={active.test.id}
            replay={active.investigation.replay}
            playheadMs={playheadMs}
            playing={playing}
            onTogglePlay={togglePlay}
            onSeek={seek}
            playbackRate={speed}
            autoPlay
          />
        </div>
      </div>
    </div>
  );
}
