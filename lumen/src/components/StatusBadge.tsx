import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  ShieldAlert,
  Sparkles,
  CircleDot,
  Loader2,
} from "lucide-react";
import type { JourneyStatus, ScreenStatus, TestStatus } from "../types";
import { journeyStatusLabel, testStatusLabel } from "../data/helpers";

const base = "pill";

export function TestStatusBadge({ status }: { status: TestStatus }) {
  const map: Record<TestStatus, string> = {
    pass: "bg-status-passBg text-status-pass",
    fail: "bg-status-failBg text-status-fail",
    warning: "bg-status-warnBg text-status-warn",
    "not-executed": "bg-status-idleBg text-status-idle",
    running: "bg-cyan-50 text-cyan-700",
  };
  const Icon =
    status === "pass"
      ? CheckCircle2
      : status === "fail"
        ? XCircle
        : status === "warning"
          ? AlertTriangle
          : status === "running"
            ? Loader2
            : MinusCircle;
  return (
    <span className={`${base} ${map[status]}`}>
      <Icon size={13} className={status === "running" ? "animate-spin" : undefined} />
      {testStatusLabel[status]}
    </span>
  );
}

const liveStatusLabel: Record<Exclude<ScreenStatus, JourneyStatus>, string> = {
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  discovered: "Discovered",
};

export function JourneyStatusBadge({ status }: { status: ScreenStatus }) {
  if (status === "running" || status === "passed" || status === "failed" || status === "discovered") {
    const map: Record<typeof status, string> = {
      running: "bg-cyan-50 text-cyan-700",
      passed: "bg-status-passBg text-status-pass",
      failed: "bg-status-failBg text-status-fail",
      discovered: "bg-slate-100 text-slate-600",
    };
    return (
      <span className={`${base} ${map[status]}`}>
        {liveStatusLabel[status]}
      </span>
    );
  }
  const map: Record<JourneyStatus, string> = {
    healthy: "bg-status-passBg text-status-pass",
    warning: "bg-status-warnBg text-status-warn",
    broken: "bg-status-failBg text-status-fail",
  };
  const Icon =
    status === "healthy" ? CheckCircle2 : status === "warning" ? AlertTriangle : XCircle;
  return (
    <span className={`${base} ${map[status]}`}>
      <Icon size={13} />
      {journeyStatusLabel[status]}
    </span>
  );
}

export function AiBadge({ label = "AI recommendation" }: { label?: string }) {
  return (
    <span className={`${base} bg-status-aiBg text-status-ai`}>
      <Sparkles size={13} />
      {label}
    </span>
  );
}

export function DotStatus({ status }: { status: JourneyStatus }) {
  const color =
    status === "healthy"
      ? "text-status-pass"
      : status === "warning"
        ? "text-status-warn"
        : "text-status-fail";
  return <CircleDot size={14} className={color} />;
}

export function SeverityIcon() {
  return <ShieldAlert size={13} />;
}
