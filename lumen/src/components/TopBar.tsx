import { useEffect, useRef, useState } from "react";
import { ChevronDown, UserCog, Check, Search } from "lucide-react";
import type { UserRole } from "../types";
import { roleDescriptions, roleLabels, useRole } from "../context/RoleContext";

const roles: UserRole[] = ["qa", "developer", "product-owner"];

export function TopBar() {
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="Search screens, journeys, tests..."
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-xs text-slate-400">Viewing as</div>
          <div className="text-sm font-semibold text-slate-800">{roleLabels[role]}</div>
        </div>
        <div className="relative" ref={ref}>
          <button
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-brand-700">
              <UserCog size={16} />
            </span>
            <ChevronDown size={16} className="text-slate-400" />
          </button>

          {open && (
            <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-cardHover">
              <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Switch role
              </div>
              {roles.map((r) => (
                <button
                  key={r}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  onClick={() => {
                    setRole(r);
                    setOpen(false);
                  }}
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <UserCog size={16} />
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">{roleLabels[r]}</span>
                      {role === r && <Check size={16} className="text-brand-600" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {roleDescriptions[r]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
