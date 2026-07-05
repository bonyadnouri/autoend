import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Globe,
  Plug,
  ScanSearch,
  Share2,
  Route as RouteIcon,
  FlaskConical,
  ShieldAlert,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import type { ExploreOptions } from "../types";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { useCreateAnalysis } from "../hooks/mutations";
import { isSupabaseConfigured } from "../lib/supabase";
import { analysisIdForUrl } from "../lib/constants";
import { startRun, useAiModels, waitForRunPickup } from "../lib/runs";
import { SupabaseSetupBanner } from "../components/SupabaseSetupBanner";

/** How long to wait for the daemon to claim a queued run before warning. */
const PICKUP_TIMEOUT_MS = 9000;

const steps = [
  { icon: Plug, text: "AI connects to the application" },
  { icon: ScanSearch, text: "Automatically explores UI screen-by-screen" },
  { icon: Share2, text: "Builds an interactive navigation graph" },
  { icon: RouteIcon, text: "Detects user journeys" },
  { icon: FlaskConical, text: "Generates test scenarios" },
  { icon: ShieldAlert, text: "Identifies missing or broken functionality" },
];

const defaultOptions: ExploreOptions = {
  recordVideo: true,
  captureNetwork: true,
  deepAnalysis: true,
};

export function StartAnalysis() {
  const navigate = useNavigate();
  const { appSummary } = useAnalysisData();
  const createAnalysis = useCreateAnalysis();
  const { data: models } = useAiModels();
  const [target, setTarget] = useState(appSummary.appUrl);
  const [starting, setStarting] = useState(false);
  const [model, setModel] = useState<string>("");
  const [warning, setWarning] = useState<string | null>(null);

  // Preselect the daemon's recommended (strongest) model once the list arrives.
  useEffect(() => {
    if (!model && models && models.length > 0) {
      setModel(models.find((m) => m.isDefault)?.id ?? models[0].id);
    }
  }, [models, model]);

  async function start() {
    const value = target.trim();
    if (!value) return;
    setWarning(null);
    setStarting(true);

    if (isSupabaseConfigured) {
      try {
        // A project is keyed by its URL: same URL → same id (re-run replaces it),
        // new URL → new project. Use that id for BOTH create and the run so they
        // can't disagree, and switch the UI to it (createAnalysis sets context).
        const projectId = analysisIdForUrl(value);
        await createAnalysis.mutateAsync({ id: projectId, appUrl: value });
        const runId = await startRun({
          analysisId: projectId,
          kind: "full",
          targetUrl: value,
          model: model || null,
        });
        // Confirm the daemon actually picked up the run; if not, it's likely
        // offline — warn instead of silently leaving a run stuck 'queued'.
        const pickedUp = await waitForRunPickup(runId, PICKUP_TIMEOUT_MS);
        if (!pickedUp) {
          setWarning(
            "Run queued, but the autoend daemon hasn't picked it up. Make sure `autoend serve` is running, then it will start automatically.",
          );
          setStarting(false);
          return;
        }
        navigate("/");
        return;
      } catch (err) {
        console.error(err);
        alert("Could not start analysis. Check Supabase setup and autoend serve daemon.");
        setStarting(false);
        return;
      }
    }

    navigate("/exploring", { state: { target: value, options: defaultOptions } });
    setStarting(false);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-800">
      <SupabaseSetupBanner />
      {/* subtle brand wash at the top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(51,102,255,0.10),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <div className="animate-fade-in-up flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-card">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white">
            <Sparkles size={12} />
          </span>
          Lumen Agent
        </div>

        <h1
          className="animate-fade-in-up mt-6 text-center text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl"
          style={{ animationDelay: "60ms" }}
        >
          AI Application Explorer
        </h1>
        <p
          className="animate-fade-in-up mt-3 max-w-lg text-center text-base text-slate-500"
          style={{ animationDelay: "120ms" }}
        >
          Analyze any application and generate its user flows, tests, and insights.
        </p>

        {/* Primary input */}
        <div className="animate-fade-in-up mt-10 w-full" style={{ animationDelay: "180ms" }}>
          <div className="card flex items-center gap-2 p-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <Globe size={18} className="ml-2 shrink-0 text-slate-400" />
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="Enter app URL"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {isSupabaseConfigured && (
            <div className="card mt-3 flex items-center gap-2 p-2">
              <Cpu size={18} className="ml-2 shrink-0 text-slate-400" />
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 focus:outline-none"
              >
                {!models || models.length === 0 ? (
                  <option value="">Auto (daemon default)</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.isDefault ? " (recommended)" : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
          {isSupabaseConfigured && (!models || models.length === 0) && (
            <p className="mt-2 text-xs text-slate-400">
              No models published yet — start the <code className="font-mono">autoend serve</code> daemon to populate the list.
            </p>
          )}

          <button
            onClick={() => void start()}
            disabled={!target.trim() || createAnalysis.isPending || starting}
            className="btn-primary group mt-3 w-full py-3.5"
          >
            {starting ? "Starting…" : "Start Exploration"}
            <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          {warning && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          )}
        </div>

        {/* What will happen */}
        <div
          className="animate-fade-in-up mt-12 w-full card p-6"
          style={{ animationDelay: "240ms" }}
        >
          <h2 className="section-title">What will happen</h2>
          <ol className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-brand-600">
                  <step.icon size={16} />
                </span>
                <span className="text-sm text-slate-700">
                  <span className="mr-1 font-mono text-xs text-slate-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <button
          onClick={() => navigate("/")}
          className="animate-fade-in-up mt-8 text-sm text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
          style={{ animationDelay: "300ms" }}
        >
          Skip for now, go to the app
        </button>
      </div>
    </div>
  );
}
