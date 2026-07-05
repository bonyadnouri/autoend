import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Layers,
  MousePointerClick,
  Route as RouteIcon,
  Gauge,
  Network,
  ArrowRight,
  X,
  Loader2,
  CheckCircle2,
  Radar,
  Share2,
  Terminal,
} from "lucide-react";
import type { ExploreLaunchState } from "../types";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { GraphPreview } from "../components/launch/GraphPreview";

type Phase = "connecting" | "scanning" | "building" | "done";
const TICK_MS = 420;
const connectingLines = ["Launching AI agent...", "Opening application..."];

const phaseSteps: { id: Phase; label: string }[] = [
  { id: "connecting", label: "Connecting" },
  { id: "scanning", label: "Scanning" },
  { id: "building", label: "Building Graph" },
];

const phaseRank: Record<Phase, number> = {
  connecting: 0,
  scanning: 1,
  building: 2,
  done: 3,
};

export function LiveExploration() {
  const navigate = useNavigate();
  const location = useLocation();
  const { explorationLog, explorationScreenOrder, journeys, screens, getScreen } =
    useAnalysisData();
  const launch = location.state as ExploreLaunchState | null;
  const target = launch?.target ?? "https://demo.shopflow.app";
  const options = launch?.options;

  const [phase, setPhase] = useState<Phase>("connecting");
  const [step, setStep] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: number | undefined;
    const startTimer = window.setTimeout(() => {
      setPhase("scanning");
      interval = window.setInterval(() => {
        setStep((s) => {
          const next = s + 1;
          if (next >= explorationLog.length) window.clearInterval(interval);
          return Math.min(next, explorationLog.length);
        });
      }, TICK_MS);
    }, 1300);
    return () => {
      window.clearTimeout(startTimer);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (step >= explorationLog.length) {
      setPhase("done");
      return;
    }
    const processed = explorationLog.slice(0, step);
    if (
      processed.some((l) =>
        /Mapping user journeys|Generating test|Building|Analyzing results/i.test(l),
      )
    ) {
      setPhase("building");
    }
  }, [step]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = window.setTimeout(() => navigate("/"), 4000);
    return () => window.clearTimeout(t);
  }, [phase, navigate]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [step, phase]);

  const processedLog = explorationLog.slice(0, step);
  const shownLog = phase === "connecting" ? connectingLines : [...connectingLines, ...processedLog];

  const discoveryCount = processedLog.filter(
    (l) => l.startsWith("Discovered screen:") || l.startsWith("Detected entry point:"),
  ).length;
  const revealedIds = explorationScreenOrder.slice(0, discoveryCount);
  const activeId = revealedIds[revealedIds.length - 1] ?? null;

  const stats = useMemo(() => {
    const revealed = revealedIds.map((id) => getScreen(id)).filter((s) => s);
    const actions = revealed.reduce((acc, s) => acc + (s ? s.elements.length : 0), 0);
    const flows = processedLog.some((l) => /Identified \d+ user journeys/.test(l))
      ? journeys.length
      : processedLog.some((l) => /Mapping user journeys/.test(l))
        ? Math.max(1, Math.round(journeys.length / 2))
        : 0;
    const progress =
      phase === "connecting"
        ? 0
        : phase === "done"
          ? 100
          : Math.round((step / explorationLog.length) * 100);
    return { screens: revealed.length, actions, flows, progress };
  }, [revealedIds, processedLog, step, phase]);

  const done = phase === "done";

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-800">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(51,102,255,0.08),transparent_70%)]"
        aria-hidden
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
            <Radar size={18} className={done ? "" : "animate-pulse"} />
          </span>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">Exploring Application</h1>
            <p className="font-mono text-xs text-slate-500">{target}</p>
          </div>
        </div>

        <PhaseStepper phase={phase} />

        <button onClick={() => navigate("/")} className="btn-secondary px-3 py-2 text-xs">
          <X size={14} /> Skip to app
        </button>
      </header>

      {/* Body */}
      <div className="relative z-10 grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-3">
        {/* Left: stats + log */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Layers} label="Screens discovered" value={stats.screens} />
            <StatCard icon={MousePointerClick} label="Actions detected" value={stats.actions} />
            <StatCard icon={RouteIcon} label="Flows identified" value={stats.flows} />
            <StatCard icon={Gauge} label="Progress" value={`${stats.progress}%`} accent />
          </div>

          {options && (
            <div className="flex flex-wrap gap-1.5">
              {options.recordVideo && <OptionChip icon={Radar} label="Recording" />}
              {options.captureNetwork && <OptionChip icon={Network} label="Network capture" />}
              {options.deepAnalysis && <OptionChip icon={Sparkles} label="Deep analysis" />}
            </div>
          )}

          <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-900 px-4 py-2.5">
              <Terminal size={14} className="text-slate-300" />
              <span className="text-sm font-medium text-slate-200">Agent activity</span>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-900 px-4 py-3 font-mono text-[13px] leading-relaxed">
              {shownLog.map((line, i) => {
                const isLast = i === shownLog.length - 1;
                return (
                  <div key={i} className="flex items-start gap-2.5 py-0.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    <span
                      className={
                        line.startsWith("Warning")
                          ? "text-amber-400"
                          : line.includes("complete")
                            ? "text-emerald-400"
                            : "text-slate-300"
                      }
                    >
                      {line}
                      {isLast && !done && <span className="caret-blink ml-1 text-emerald-400">|</span>}
                    </span>
                  </div>
                );
              })}
              {!done && (
                <div className="mt-1 flex items-center gap-2 text-slate-500">
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-xs">{phaseLabel(phase)}</span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </section>
        </div>

        {/* Right: graph preview */}
        <div className="relative min-h-0 lg:col-span-2">
          <section className="card h-full overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Share2 size={14} className="text-brand-600" />
                <span className="text-sm font-medium text-slate-700">Knowledge graph</span>
              </div>
              <span className="text-xs text-slate-500">{stats.screens} nodes discovered</span>
            </div>
            <div className="relative h-[calc(100%-42px)] bg-slate-50">
              {stats.screens === 0 && (
                <div className="absolute inset-0 z-10 grid place-items-center">
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <span className="relative grid h-16 w-16 place-items-center">
                      <span className="absolute inset-0 rounded-full border-2 border-brand-200 border-t-brand-500 animate-orb-spin" />
                      <Sparkles size={22} className="text-brand-500" />
                    </span>
                    <span className="text-sm">{phaseLabel(phase)}</span>
                  </div>
                </div>
              )}
              <GraphPreview revealedIds={revealedIds} activeId={activeId} />
            </div>
          </section>

          {done && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-slate-900/10 backdrop-blur-sm">
              <div className="animate-fade-in-up card flex max-w-sm flex-col items-center p-8 text-center shadow-cardHover">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-status-passBg text-status-pass">
                  <CheckCircle2 size={30} />
                </span>
                <h2 className="mt-4 text-xl font-bold text-slate-900">Exploration complete</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Discovered {screens.length} screens and {journeys.length} user journeys. Opening
                  the application map...
                </p>
                <button
                  onClick={() => navigate("/")}
                  className="btn-primary group mt-5"
                >
                  Open Application Map
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "connecting":
      return "Launching AI agent...";
    case "scanning":
      return "Scanning screens...";
    case "building":
      return "Building navigation graph...";
    case "done":
      return "Done";
  }
}

function PhaseStepper({ phase }: { phase: Phase }) {
  return (
    <div className="hidden items-center gap-2 md:flex">
      {phaseSteps.map((s, i) => {
        const active = phase === s.id;
        const complete = phaseRank[phase] > phaseRank[s.id];
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : complete
                    ? "border-status-pass/30 bg-status-passBg text-status-pass"
                    : "border-slate-200 text-slate-400"
              }`}
            >
              {complete ? (
                <CheckCircle2 size={13} />
              ) : (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${active ? "bg-brand-500 animate-pulse" : "bg-slate-300"}`}
                />
              )}
              {s.label}
            </div>
            {i < phaseSteps.length - 1 && <span className="h-px w-4 bg-slate-200" />}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Layers;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-slate-500">
        <Icon size={14} className={accent ? "text-brand-600" : ""} />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${accent ? "text-brand-600" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function OptionChip({ icon: Icon, label }: { icon: typeof Layers; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
      <Icon size={12} className="text-brand-600" />
      {label}
    </span>
  );
}
