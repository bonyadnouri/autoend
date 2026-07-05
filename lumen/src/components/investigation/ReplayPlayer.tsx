import { useEffect, useRef } from "react";
import { Play, Pause, SkipBack, Video, AlertOctagon, MousePointerClick } from "lucide-react";
import type { Replay } from "../../types";
import { formatClock } from "../../data/helpers";
import { useAnalysisData } from "../../context/AnalysisDataContext";
import { ScreenshotPlaceholder } from "../ScreenshotPlaceholder";

interface Props {
  replay: Replay;
  playheadMs: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  autoPlay?: boolean;
  /** Playback rate for video replays (frame-based playback is driven by the parent). */
  playbackRate?: number;
}

export function ReplayPlayer({
  replay,
  playheadMs,
  playing,
  onTogglePlay,
  onSeek,
  autoPlay,
  playbackRate = 1,
}: Props) {
  const { getScreen } = useAnalysisData();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!autoPlay || !replay.videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {
      /* blocked by browser policy — user can press play manually */
    });
  }, [autoPlay, replay.videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackRate;
  }, [playbackRate, replay.videoUrl]);

  if (replay.videoUrl) {
    return (
      <div className="card overflow-hidden">
        <video
          ref={videoRef}
          src={replay.videoUrl}
          controls
          autoPlay={autoPlay}
          className="aspect-video w-full bg-black"
        />
      </div>
    );
  }

  const frames = replay.frames;
  if (frames.length === 0) {
    return (
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <Video size={15} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-900">Test replay</span>
        </div>
        <div className="grid aspect-video place-items-center bg-slate-900 text-sm text-slate-400">
          No replay recording available for this test.
        </div>
      </div>
    );
  }

  const activeIndex = Math.max(
    0,
    frames.reduce((acc, f, i) => (f.tMs <= playheadMs ? i : acc), 0),
  );
  const frame = frames[activeIndex];
  const screen = getScreen(frame.screenId);
  const pct = replay.durationMs > 0 ? (playheadMs / replay.durationMs) * 100 : 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <Video size={15} className="text-slate-400" />
        <span className="text-sm font-semibold text-slate-900">Test replay</span>
        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
          Simulated
        </span>
      </div>

      <div className="relative bg-slate-900 p-4">
        <div className="mx-auto max-w-md">
          {screen && <ScreenshotPlaceholder name={screen.name} accent={screen.accent} />}
        </div>

        {frame.marker === "failure" && (
          <span className="absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-md bg-status-fail px-2 py-1 text-xs font-semibold text-white shadow">
            <AlertOctagon size={13} /> Failure point
          </span>
        )}
        {frame.marker === "action" && (
          <span className="absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-md bg-status-ai px-2 py-1 text-xs font-semibold text-white shadow">
            <MousePointerClick size={13} /> Action
          </span>
        )}

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
          {frame.caption}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="relative h-2">
          <input
            type="range"
            min={0}
            max={replay.durationMs}
            step={20}
            value={playheadMs}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="absolute inset-0 z-10 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600"
            aria-label="Seek replay"
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          </div>
          {frames.map((f, i) => (
            <span
              key={i}
              className={`pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${
                f.marker === "failure"
                  ? "bg-status-fail"
                  : f.marker === "action"
                    ? "bg-status-ai"
                    : "bg-slate-400"
              }`}
              style={{ left: `${(f.tMs / replay.durationMs) * 100}%` }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={() => onSeek(0)}
            aria-label="Restart"
          >
            <SkipBack size={15} />
          </button>
          <span className="font-mono text-xs text-slate-500">
            {formatClock(playheadMs)} / {formatClock(replay.durationMs)}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            Frame {activeIndex + 1} of {frames.length}
          </span>
        </div>
      </div>
    </div>
  );
}
