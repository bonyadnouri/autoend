import { ShieldAlert } from "lucide-react";
import type { Severity } from "../types";
import { severityLabel } from "../data/helpers";

const map: Record<Severity, string> = {
  critical: "bg-status-failBg text-status-fail",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-status-warnBg text-status-warn",
  low: "bg-status-idleBg text-status-idle",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`pill ${map[severity]}`}>
      <ShieldAlert size={13} />
      {severityLabel[severity]}
    </span>
  );
}
