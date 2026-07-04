import type { FaultDomain, FindingKind } from "../types";

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

/** Finding tier sort order (CONTEXT.md tiers) shared by Overview / Findings. */
export const TIER_RANK: Record<FindingKind, number> = {
  "hard-failure": 0,
  regression: 1,
  advisory: 2,
};

/** Fault domain → display label shared by FailureAnalysisCard / ExportMenu. */
export const FAULT_LABEL: Record<FaultDomain, string> = {
  app: "App",
  flow: "Flow",
  environment: "Environment",
};

export function formatDuration(ms: number): string {
  if (ms <= 0) return "-";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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
