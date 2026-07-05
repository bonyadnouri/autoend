import { ImageIcon } from "lucide-react";

interface Props {
  name: string;
  accent: string;
  className?: string;
}

export function ScreenshotPlaceholder({ name, accent, className = "" }: Props) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      <div
        className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2"
        style={{ backgroundColor: `${accent}0d` }}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-status-fail/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-status-warn/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-status-pass/60" />
        <span className="ml-2 truncate text-xs text-slate-400">shopflow.app / {name.toLowerCase().replace(/\s+/g, "-")}</span>
      </div>
      <div className="space-y-3 p-4">
        <div className="h-8 w-1/2 rounded-md" style={{ backgroundColor: `${accent}26` }} />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-16 rounded-md bg-slate-100" />
          <div className="h-16 rounded-md bg-slate-100" />
          <div className="h-16 rounded-md bg-slate-100" />
        </div>
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-4/5 rounded bg-slate-100" />
        <div className="flex items-center gap-2 pt-1">
          <div
            className="h-8 w-24 rounded-md"
            style={{ backgroundColor: accent }}
          />
          <div className="h-8 w-20 rounded-md border border-slate-200" />
        </div>
      </div>
      <div className="pointer-events-none absolute right-3 top-12 flex items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-400 backdrop-blur">
        <ImageIcon size={11} /> captured
      </div>
    </div>
  );
}
