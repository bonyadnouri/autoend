import { CheckCircle2, XCircle, Sparkles, TrendingDown, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FindingKind, FlowSnapshot } from "../types";
import { KIND_LABEL, KIND_TONE } from "../data/helpers";

const base = "pill";

const toneClass: Record<"pass" | "warn" | "fail" | "ai", string> = {
  pass: "bg-status-passBg text-status-pass",
  warn: "bg-status-warnBg text-status-warn",
  fail: "bg-status-failBg text-status-fail",
  ai: "bg-status-aiBg text-status-ai",
};

type FlowStatus = FlowSnapshot["status"];

const flowMeta: Record<FlowStatus, { tone: keyof typeof toneClass; icon: LucideIcon; label: string }> = {
  passed: { tone: "pass", icon: CheckCircle2, label: "Passed" },
  failed: { tone: "fail", icon: XCircle, label: "Failed" },
  discovered: { tone: "ai", icon: Sparkles, label: "Discovered" },
};

export function FlowStatusBadge({ status }: { status: FlowStatus }) {
  const { tone, icon: Icon, label } = flowMeta[status];
  return (
    <span className={`${base} ${toneClass[tone]}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

const kindIcon: Record<FindingKind, LucideIcon> = {
  "hard-failure": XCircle,
  regression: TrendingDown,
  advisory: Lightbulb,
};

export function KindBadge({ kind }: { kind: FindingKind }) {
  const Icon = kindIcon[kind];
  return (
    <span className={`${base} ${toneClass[KIND_TONE[kind]]}`}>
      <Icon size={13} />
      {KIND_LABEL[kind]}
    </span>
  );
}
