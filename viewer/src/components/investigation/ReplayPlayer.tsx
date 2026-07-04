import { forwardRef, useImperativeHandle, useRef } from "react";
import { Video } from "lucide-react";
import { evidenceUrl } from "../../data/report";

export interface ReplayPlayerHandle {
  /** Jump the Evidence video to `ms` from the Flow's start and play. */
  seekTo: (ms: number) => void;
}

/** The Evidence video with a seek handle so Timeline steps and screenshots can drive it. */
export const ReplayPlayer = forwardRef<ReplayPlayerHandle, { file: string }>(
  function ReplayPlayer({ file }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        seekTo(ms: number) {
          const v = videoRef.current;
          if (!v) return;
          v.currentTime = ms / 1000;
          void v.play().catch(() => {
            /* autoplay may be blocked; the seek still lands */
          });
        },
      }),
      [],
    );

    return (
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Video size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Evidence</h2>
        </div>
        <video
          ref={videoRef}
          src={evidenceUrl(file)}
          controls
          preload="metadata"
          className="aspect-video w-full bg-black"
        />
      </section>
    );
  },
);
