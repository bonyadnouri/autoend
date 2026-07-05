import { useCallback, useRef, useState, type CSSProperties } from "react";
import type { VisualComparison, VisualOverlay } from "../../types";
import { evidenceUrl } from "../../data/report";

function pct(n: number, of: number): string {
  return `${((n / of) * 100).toFixed(3)}%`;
}

function overlayStyle(
  overlay: VisualOverlay,
  imgW: number,
  imgH: number,
): CSSProperties {
  const b = overlay.box!;
  return {
    left: pct(b.x, imgW),
    top: pct(b.y, imgH),
    width: pct(b.width, imgW),
    height: pct(b.height, imgH),
  };
}

const overlayClass: Record<string, string> = {
  "design-contract": "border-2 border-dashed border-amber-500 bg-amber-500/10",
  "dom-geometry": "border border-sky-500/80",
  "pixel-diff": "border border-red-500/80 bg-red-500/10",
  model: "border-2 border-violet-500 bg-violet-500/10",
};

interface Props {
  visual: VisualComparison;
}

/** Spec comparison instrument — slider, layer toggles, overlay boxes (ported from standalone viewer). */
export function VisualComparePanel({ visual }: Props) {
  const [cutPos, setCutPos] = useState(42);
  const [showSpec, setShowSpec] = useState(true);
  const [showDelta, setShowDelta] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [imgSize, setImgSize] = useState({ w: 1280, h: 720 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const [vw, vh] = visual.viewport.split("x").map((n) => parseInt(n, 10) || 0);
  const aspectW = imgSize.w || vw || 1280;
  const aspectH = imgSize.h || vh || 720;

  const onActualLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0) setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const setPosFromEvent = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const p = ((clientX - r.left) / r.width) * 100;
    setCutPos(Math.max(0, Math.min(100, p)));
  }, []);

  const overlays = (visual.overlays ?? []).filter((o) => o.box);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {visual.expectedFile && (
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${showSpec ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
            onClick={() => setShowSpec((v) => !v)}
          >
            Spec region
          </button>
        )}
        {visual.diffFile && (
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${showDelta ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
            onClick={() => setShowDelta((v) => !v)}
          >
            Pixel delta
            {visual.changedRatio != null ? ` · ${(visual.changedRatio * 100).toFixed(1)}%` : ""}
          </button>
        )}
        {overlays.length > 0 && (
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${showBoxes ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
            onClick={() => setShowBoxes((v) => !v)}
          >
            Overlays · {overlays.length}
          </button>
        )}
      </div>

      <div
        ref={canvasRef}
        className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 touch-none select-none"
        style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
        onPointerDown={(e) => {
          if (!visual.expectedFile || !showSpec) return;
          dragging.current = true;
          canvasRef.current?.setPointerCapture(e.pointerId);
          setPosFromEvent(e.clientX);
          e.preventDefault();
        }}
        onPointerMove={(e) => {
          if (dragging.current) setPosFromEvent(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <img
          src={evidenceUrl(visual.actualFile)}
          alt="Live capture"
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
          onLoad={onActualLoad}
        />

        {showDelta && visual.diffFile && (
          <img
            src={evidenceUrl(visual.diffFile)}
            alt="Pixel diff"
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        )}

        {showSpec && visual.expectedFile && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - cutPos}% 0 0)` }}
          >
            <img
              src={evidenceUrl(visual.expectedFile)}
              alt="Expected spec render"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>
        )}

        {showBoxes &&
          overlays.map((o) => (
            <div
              key={o.id}
              className={`absolute rounded-sm ${overlayClass[o.source] ?? "border border-slate-400"}`}
              style={overlayStyle(o, aspectW, aspectH)}
            >
              <span className="absolute -top-5 left-0 max-w-[12rem] truncate rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white">
                {o.label}
              </span>
            </div>
          ))}

        {showSpec && visual.expectedFile && (
          <>
            <div
              className="absolute bottom-0 top-0 w-0.5 bg-white/90 shadow"
              style={{ left: `${cutPos}%` }}
            />
            <div
              className="absolute top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-slate-300 bg-white shadow"
              style={{ left: `${cutPos}%` }}
              role="slider"
              tabIndex={0}
              aria-label="Spec versus live cut position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(cutPos)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setCutPos((p) => Math.max(0, p - 3));
                else if (e.key === "ArrowRight") setCutPos((p) => Math.min(100, p + 3));
                else if (e.key === "Home") setCutPos(0);
                else if (e.key === "End") setCutPos(100);
              }}
            >
              <span className="text-xs text-slate-500">↔</span>
            </div>
            <span className="absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
              Spec
            </span>
            <span className="absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
              Live
            </span>
          </>
        )}
      </div>
    </div>
  );
}
