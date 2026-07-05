import { useEffect, useRef, useState } from "react";
import {
  Network,
  Route,
  ListChecks,
  ScanEye,
  Sparkles,
  Rocket,
  ChevronsUpDown,
  Check,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { useAnalysis } from "../context/AnalysisContext";
import { useProjects } from "../hooks/useProjects";
import { isSupabaseConfigured } from "../lib/supabase";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", label: "Application Map", icon: Network, end: true },
  // { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  // { to: "/exploration", label: "AI Exploration", icon: Radar },
  { to: "/journeys", label: "User Journeys", icon: Route },
  { to: "/tests", label: "Test Scenarios", icon: ListChecks },
  // { to: "/insights", label: "AI Insights", icon: Lightbulb },
  { to: "/visual-integrity", label: "Visual Integrity", icon: ScanEye },
];

const startAnalysisItem: NavItem = {
  to: "/start",
  label: "Start Analysis",
  icon: Rocket,
};

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200 px-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <Sparkles size={18} />
        </span>
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-slate-900">Lumen</div>
          <div className="text-xs text-slate-500">AI App Analysis</div>
        </div>
      </div>

      <nav className="flex-1 px-3 pb-2 pt-8">
        <SidebarLink item={startAnalysisItem} variant="action" />

        <div className="mb-3 mt-8 border-t border-slate-200" />

        <div className="space-y-1">
          {navItems.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </div>
      </nav>

      <ProjectSwitcher />
    </aside>
  );
}

function SidebarLink({
  item,
  variant = "default",
}: {
  item: NavItem;
  variant?: "default" | "action";
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => {
        if (variant === "action") {
          return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
            isActive
              ? "bg-brand-600 text-white shadow-sm"
              : "border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
          }`;
        }
        return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-brand-50 text-brand-700"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`;
      }}
    >
      <item.icon size={18} />
      {item.label}
    </NavLink>
  );
}

function ProjectSwitcher() {
  const { appSummary } = useAnalysisData();
  const { analysisId, setAnalysisId } = useAnalysis();
  const { data: projects } = useProjects();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const hasMultiple = isSupabaseConfigured && (projects?.length ?? 0) > 0;

  const select = (id: string) => {
    setOpen(false);
    if (id !== analysisId) setAnalysisId(id);
    navigate("/");
  };

  return (
    <div ref={ref} className="relative m-3">
      <button
        type="button"
        onClick={() => hasMultiple && setOpen((v) => !v)}
        className={`w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left ${
          hasMultiple ? "hover:border-slate-300 hover:bg-slate-100" : "cursor-default"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Project</span>
          {hasMultiple && <ChevronsUpDown size={14} className="text-slate-400" />}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-status-pass" />
          <span className="truncate text-sm font-semibold text-slate-800">{appSummary.appName}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-400">{appSummary.appUrl}</div>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {projects?.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p.id)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
            >
              <Check
                size={14}
                className={`mt-0.5 shrink-0 ${p.id === analysisId ? "text-brand-600" : "text-transparent"}`}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{p.app_name}</span>
                <span className="block truncate text-xs text-slate-400">{p.app_url}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/start");
            }}
            className="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-slate-50"
          >
            <Plus size={14} className="shrink-0" />
            New analysis
          </button>
        </div>
      )}
    </div>
  );
}
