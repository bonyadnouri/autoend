import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  LogIn,
  Home,
  ShoppingBag,
  Package,
  ShoppingCart,
  CreditCard,
  CheckCircle2,
  User,
  Settings,
  UserPlus,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import type { ScreenStatus } from "../types";

const iconMap: Record<string, typeof Home> = {
  login: LogIn,
  signup: UserPlus,
  home: Home,
  products: ShoppingBag,
  "product-detail": Package,
  cart: ShoppingCart,
  checkout: CreditCard,
  confirmation: CheckCircle2,
  profile: User,
  settings: Settings,
};

export interface ScreenNodeData {
  screenId: string;
  name: string;
  type: string;
  status: ScreenStatus;
  isEntryPoint: boolean;
  elementCount: number;
  issueCount: number;
  dimmed: boolean;
  highlighted: boolean;
  [key: string]: unknown;
}

const statusRing: Record<ScreenStatus, string> = {
  healthy: "border-slate-200",
  warning: "border-status-warn/40",
  broken: "border-status-fail/50",
  running: "border-cyan-400 animate-pulse",
  passed: "border-emerald-400",
  failed: "border-red-500",
  discovered: "border-dashed border-slate-300",
};

const statusDot: Record<ScreenStatus, string> = {
  healthy: "bg-status-pass",
  warning: "bg-status-warn",
  broken: "bg-status-fail",
  running: "bg-cyan-400 animate-pulse",
  passed: "bg-emerald-500",
  failed: "bg-red-500",
  discovered: "bg-slate-300",
};

export function ScreenNode({ data, selected }: NodeProps) {
  const d = data as ScreenNodeData;
  const Icon = iconMap[d.screenId] ?? Home;

  return (
    <div
      className={`w-52 rounded-xl border-2 bg-white shadow-card transition-all ${
        statusRing[d.status]
      } ${selected || d.highlighted ? "ring-2 ring-brand-400 ring-offset-2" : ""} ${
        d.dimmed ? "opacity-35" : "opacity-100"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-white !bg-slate-400" />
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{d.name}</div>
          <div className="text-[11px] capitalize text-slate-400">{d.type} screen</div>
        </div>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot[d.status]}`} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {d.isEntryPoint && (
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
              Entry
            </span>
          )}
          <span className="text-[11px] text-slate-400">{d.elementCount} elements</span>
        </div>
        {d.issueCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-fail">
            {d.status === "broken" ? <XCircle size={12} /> : <AlertTriangle size={12} />}
            {d.issueCount}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-white !bg-slate-400" />
    </div>
  );
}
