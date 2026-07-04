import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "neutral" | "pass" | "warn" | "fail" | "ai";

const toneMap: Record<Tone, { icon: string; value: string }> = {
  neutral: { icon: "bg-slate-100 text-slate-600", value: "text-slate-900" },
  pass: { icon: "bg-status-passBg text-status-pass", value: "text-status-pass" },
  warn: { icon: "bg-status-warnBg text-status-warn", value: "text-status-warn" },
  fail: { icon: "bg-status-failBg text-status-fail", value: "text-status-fail" },
  ai: { icon: "bg-status-aiBg text-status-ai", value: "text-status-ai" },
};

interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  onClick?: () => void;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  onClick,
}: MetricCardProps) {
  const tones = toneMap[tone];
  const clickable = Boolean(onClick);
  return (
    <div
      className={`card p-5 ${clickable ? "card-hover cursor-pointer" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="flex items-start justify-between">
        <span className="section-title">{label}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tones.icon}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className={`mt-3 text-3xl font-bold tracking-tight ${tones.value}`}>{value}</div>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
