import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  ShieldAlert,
  Sparkles,
  CircleDot,
} from "lucide-react";
import type { JourneyStatus, TestStatus } from "../types";
import { journeyStatusLabel, testStatusLabel } from "../data/helpers";

const base = "pill";

export function TestStatusBadge({ status }: { status: TestStatus }) {
  const map: Record<TestStatus, string> = {
    pass: "bg-status-passBg text-status-pass",
    fail: "bg-status-failBg text-status-fail",
    "not-executed": "bg-status-idleBg text-status-idle",
  };
  const Icon = status === "pass" ? CheckCircle2 : status === "fail" ? XCircle : MinusCircle;
  return (
    <span className={`${base} ${map[status]}`}>
      <Icon size={13} />
      {testStatusLabel[status]}
    </span>
  );
}

export function JourneyStatusBadge({ status }: { status: JourneyStatus }) {
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
