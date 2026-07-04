import { LayoutDashboard, Route, ListChecks, Sparkles, GitBranch } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useReport } from "../data/report";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/flows", label: "Flows", icon: Route },
  { to: "/findings", label: "Findings", icon: ListChecks },
  { to: "/map", label: "Interaction map", icon: GitBranch },
];

export function Sidebar() {
  const { artifact } = useReport();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <Sparkles size={18} />
        </span>
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-slate-900">autoend</div>
          <div className="text-xs text-slate-500">Run Report</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-500">Run</div>
        <div className="mt-1 truncate font-mono text-xs text-slate-700">{artifact.runId}</div>
      </div>
    </aside>
  );
}
