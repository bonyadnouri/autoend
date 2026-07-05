import type {
  FaultDomain,
  InsightCategory,
  JourneyStatus,
  LogLevel,
  Severity,
  TestStatus,
} from "../types";

export const testStatusLabel: Record<TestStatus, string> = {
  pass: "Passed",
  fail: "Failed",
  warning: "Warning",
  "not-executed": "Not executed",
  running: "Running",
};

export const journeyStatusLabel: Record<JourneyStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  broken: "Broken",
};

export const severityLabel: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const insightCategoryLabel: Record<InsightCategory, string> = {
  "missing-functionality": "Missing functionality",
  "broken-flow": "Broken flow",
  "ux-inconsistency": "UX inconsistency",
  "unreachable-screen": "Unreachable screen",
  "unexpected-navigation": "Unexpected navigation",
  "suggested-improvement": "Suggested improvement",
};

export const severityRank: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
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

export const faultDomainLabel: Record<FaultDomain, string> = {
  frontend: "Frontend",
  backend: "Backend",
  network: "Network",
  data: "Data",
  unknown: "Unknown",
};

export const logLevelLabel: Record<LogLevel, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
};
