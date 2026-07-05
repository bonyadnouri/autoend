import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { Journey } from "../types";

export interface JourneyQuickFilter {
  id: string;
  label: string;
  journeyIds: string[];
}

interface Props {
  journeys: Journey[];
  quickFilters?: JourneyQuickFilter[];
  value: string; // "all" or journey id
  onChange: (value: string) => void;
}

export function JourneySelect({ journeys, quickFilters = [], value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeQuick, setActiveQuick] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value === "all" ? null : journeys.find((j) => j.id === value);
  const label = selected ? selected.name : "All screens";

  const quick = activeQuick ? quickFilters.find((q) => q.id === activeQuick) : null;
  const showList = query.trim() !== "" || activeQuick !== null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const quickIds = quick ? new Set(quick.journeyIds) : null;
    return journeys.filter(
      (j) =>
        (!q || j.name.toLowerCase().includes(q)) && (!quickIds || quickIds.has(j.id)),
    );
  }, [journeys, query, quick]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveQuick(null);
      inputRef.current?.focus();
    }
  }, [open]);

  function select(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[200px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${selected ? "" : "text-slate-500"}`}>{label}</span>
        <ChevronDown size={15} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-cardHover">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search journeys..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {quickFilters.length > 0 && (
            <div className="mt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Quick filters
              </span>
              <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {quickFilters.map((q) => (
                  <Chip
                    key={q.id}
                    active={activeQuick === q.id}
                    onClick={() =>
                      setActiveQuick((cur) => (cur === q.id ? null : q.id))
                    }
                  >
                    {q.label}
                    <span className="ml-1 text-[10px] text-slate-400">{q.journeyIds.length}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-slate-100 pt-3">
            {showList ? (
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                <Chip fullWidth active={value === "all"} onClick={() => select("all")}>
                  All screens
                </Chip>
                {filtered.map((j) => (
                  <Chip fullWidth key={j.id} active={value === j.id} onClick={() => select(j.id)}>
                    {j.name}
                  </Chip>
                ))}
                {filtered.length === 0 && (
                  <p className="w-full py-2 text-center text-xs text-slate-400">
                    No journeys match.
                  </p>
                )}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-slate-400">
                Pick a quick filter or search to see journeys.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  fullWidth,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`items-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        fullWidth ? "flex w-full text-left" : "inline-flex"
      } ${
        active
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
