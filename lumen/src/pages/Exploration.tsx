import { useEffect, useMemo, useRef, useState } from "react";
import {
  Radar,
  Layers,
  Link2,
  MousePointerClick,
  FileText,
  Network,
  RotateCcw,
  Terminal,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAnalysisData } from "../context/AnalysisDataContext";

const TICK_MS = 480;

export function Exploration() {
  const { explorationLog, explorationScreenOrder, screens, getScreen, appSummary } = useAnalysisData();
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    if (step >= explorationLog.length) {
      setRunning(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), TICK_MS);
    return () => clearTimeout(t);
  }, [step, running]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [step]);

  const processedLog = explorationLog.slice(0, step);
  const done = step >= explorationLog.length;
  const progress = Math.round((step / explorationLog.length) * 100);

  const discoveryCount = processedLog.filter(
    (l) => l.startsWith("Discovered screen:") || l.startsWith("Detected entry point:"),
  ).length;

  const discoveredScreenIds = explorationScreenOrder.slice(0, discoveryCount);
  const discoveredScreens = discoveredScreenIds
    .map((id) => getScreen(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const counts = useMemo(() => {
    let navLinks = 0;
    let buttons = 0;
    let forms = 0;
    for (const s of discoveredScreens) {
      navLinks += s.navigation.length;
      buttons += s.elements.filter((e) => e.type === "button").length;
      forms += s.elements.filter((e) => e.type === "form" || e.type === "input").length;
    }
    return { navLinks, buttons, forms };
  }, [discoveredScreens]);

  const currentScreen = done
    ? "Analysis complete"
    : discoveredScreens.length > 0
      ? discoveredScreens[discoveredScreens.length - 1].name
      : "Initializing...";

  function restart() {
    setStep(0);
    setRunning(true);
  }

  return (
    <div>
      <PageHeader
        title="AI Exploration"
        subtitle={`Watch the AI crawl ${appSummary.appName} screen by screen, mapping navigation and interactive elements in real time.`}
        backTo="/"
        actions={
          done ? (
            <>
              <button className="btn-secondary" onClick={restart}>
                <RotateCcw size={16} /> Re-run
              </button>
              <Link to="/" className="btn-primary">
                <Network size={16} /> View application map
              </Link>
            </>
          ) : (
            <button className="btn-secondary" onClick={restart}>
              <RotateCcw size={16} /> Restart
            </button>
          )
        }
      />

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-10 w-10 place-items-center rounded-lg ${
                done ? "bg-status-passBg text-status-pass" : "bg-status-aiBg text-status-ai"
              }`}
            >
              {done ? <CheckCircle2 size={20} /> : <Radar size={20} className="animate-pulse" />}
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {done ? "Exploration finished" : "Exploring application"}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                {!done && <Loader2 size={12} className="animate-spin" />}
                Current: {currentScreen}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-tight text-slate-900">{progress}%</div>
            <div className="text-xs text-slate-500">
              {step}/{explorationLog.length} steps
            </div>
          </div>
        </div>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={Layers} label="Screens discovered" value={discoveredScreens.length} total={screens.length} />
        <StatTile icon={Link2} label="Navigation links" value={counts.navLinks} />
        <StatTile icon={MousePointerClick} label="Buttons detected" value={counts.buttons} />
        <StatTile icon={FileText} label="Inputs & forms" value={counts.forms} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Screens discovered</h2>
          <div className="space-y-2">
            {screens.map((s) => {
              const found = discoveredScreenIds.includes(s.id);
              const isCurrent =
                !done && found && discoveredScreenIds[discoveredScreenIds.length - 1] === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    found ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isCurrent
                        ? "animate-pulse bg-status-ai"
                        : found
                          ? "bg-status-pass"
                          : "bg-slate-300"
                    }`}
                  />
                  <span
                    className={`text-sm ${found ? "font-medium text-slate-800" : "text-slate-400"}`}
                  >
                    {s.name}
                  </span>
                  {isCurrent && (
                    <span className="ml-auto text-xs font-medium text-status-ai">analyzing...</span>
                  )}
                  {found && !isCurrent && (
                    <CheckCircle2 size={15} className="ml-auto text-status-pass" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card overflow-hidden lg:col-span-3">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-900 px-4 py-2.5">
            <Terminal size={15} className="text-slate-300" />
            <span className="text-sm font-medium text-slate-200">Live activity log</span>
          </div>
          <div className="h-[380px] overflow-y-auto bg-slate-900 px-4 py-3 font-mono text-[13px] leading-relaxed">
            {processedLog.map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="select-none text-slate-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
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
                </span>
              </div>
            ))}
            {!done && (
              <div className="flex gap-3">
                <span className="select-none text-slate-600">
                  {String(step + 1).padStart(2, "0")}
                </span>
                <span className="inline-block h-4 w-2 animate-pulse bg-emerald-400" />
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  total,
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  total?: number;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={16} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {value}
        {total !== undefined && <span className="text-base font-medium text-slate-400"> / {total}</span>}
      </div>
    </div>
  );
}
