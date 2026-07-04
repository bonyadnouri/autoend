import type { FindingKind } from "../types";

export const KIND_LABEL: Record<FindingKind, string> = {
  "hard-failure": "Hard Failure",
  regression: "Regression",
  advisory: "Advisory",
};

/** Kind → status colour tone shared by MetricCard / StatusBadge. */
export const KIND_TONE: Record<FindingKind, "fail" | "warn" | "ai"> = {
  "hard-failure": "fail",
  regression: "warn",
  advisory: "ai",
};

export function formatDuration(ms: number): string {
  if (ms <= 0) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
