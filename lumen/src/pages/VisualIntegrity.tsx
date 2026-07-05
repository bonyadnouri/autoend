import { useEffect, useRef, useState } from "react";
import {
  ScanEye,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  X,
  AlertTriangle,
  Globe,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import {
  ANALYSIS_STEPS,
  DEMO_SITES,
  type DemoTarget,
  resolveDemoTarget,
  STEP_MS,
} from "../lib/visualIntegrityDemo";

const BASE = "/visual-integrity";

const rulePackLabel: Record<string, string> = {
  "cms-healthcare": "CMS HealthCare",
  "uswds-federal": "USWDS Federal",
  "dsfr-france": "DSFR France",
  "google-material": "Google Material",
};

export function VisualIntegrity() {
  const [urlInput, setUrlInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [analyzedSlugs, setAnalyzedSlugs] = useState<string[]>([]);
  const pendingTarget = useRef<DemoTarget | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const openTarget = DEMO_SITES.find((t) => t.slug === openSlug) ?? null;

  useEffect(() => {
    return () => {
      for (const id of timers.current) clearTimeout(id);
    };
  }, []);

  function clearTimers() {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  }

  function schedule(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  }

  function analyze() {
    const target = resolveDemoTarget(urlInput);
    if (!target) {
      setError("This demo only supports NASA, Gouvernement.fr, and Ameli.fr.");
      return;
    }

    clearTimers();
    setError(null);
    setAnalyzing(true);
    setProgressStep(0);
    pendingTarget.current = target;

    for (let i = 1; i < ANALYSIS_STEPS.length; i++) {
      schedule(() => setProgressStep(i), STEP_MS * i);
    }

    schedule(() => {
      setAnalyzing(false);
      setProgressStep(0);
      if (pendingTarget.current) {
        const { slug } = pendingTarget.current;
        setAnalyzedSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
        setOpenSlug(slug);
        pendingTarget.current = null;
      }
    }, STEP_MS * ANALYSIS_STEPS.length);
  }

  const progressPct = analyzing
    ? Math.round(((progressStep + 1) / ANALYSIS_STEPS.length) * 100)
    : 0;

  const analyzedReports = DEMO_SITES.filter((t) => analyzedSlugs.includes(t.slug));

  return (
    <div>
      <PageHeader
        title="Visual Integrity"
        subtitle="Design-QA forensics that catch violations of published design standards (USWDS, CMS, DSFR, Google Material) with pixel diffs, DOM geometry, and dynamic spec references."
        backTo="/"
      />

      <section className="mb-8">
        <div className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <Globe size={18} className="shrink-0 text-slate-400" />
              <input
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && !analyzing && analyze()}
                placeholder="Enter URL to analyze"
                disabled={analyzing}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={analyze}
              disabled={analyzing || !urlInput.trim()}
              className="btn-primary shrink-0 py-2.5"
            >
              {analyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  Analyze <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_SITES.map((site) => (
              <button
                key={site.slug}
                type="button"
                disabled={analyzing}
                onClick={() => {
                  setUrlInput(site.url);
                  setError(null);
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
              >
                {site.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {analyzing && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
                <span>{ANALYSIS_STEPS[progressStep]}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {analyzedReports.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Reports
            <span className="ml-2 text-sm font-normal text-slate-400">
              {analyzedReports.length} analyzed
            </span>
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analyzedReports.map((t) => (
              <ReportCard key={t.slug} target={t} onOpen={() => setOpenSlug(t.slug)} />
            ))}
          </div>
        </section>
      )}

      {openTarget && <ReportModal target={openTarget} onClose={() => setOpenSlug(null)} />}
    </div>
  );
}

function ReportCard({ target, onOpen }: { target: DemoTarget; onOpen: () => void }) {
  const failed = target.status === "fail";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card group flex flex-col overflow-hidden p-0 text-left transition-shadow hover:shadow-cardHover"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
        <img
          src={`${BASE}/${target.slug}/actual.png`}
          alt={`${target.label} capture`}
          loading="lazy"
          className="h-full w-full object-cover object-top"
        />
        <span
          className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            failed ? "bg-status-failBg text-status-fail" : "bg-status-passBg text-status-pass"
          }`}
        >
          {failed ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
          {failed ? "Violation" : "Compliant"}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="min-w-0 break-words text-sm font-bold text-slate-900">{target.label}</h3>
        <p className="mt-0.5 truncate text-xs text-slate-400">{target.url}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {rulePackLabel[target.rulePack] ?? target.rulePack}
          </span>
          {target.violations.map((v) => (
            <span
              key={v}
              className="rounded-md bg-status-failBg px-2 py-0.5 font-mono text-[11px] font-semibold text-status-fail"
            >
              {v}
            </span>
          ))}
        </div>

        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 group-hover:text-brand-800">
          <ScanEye size={14} /> View forensic report
        </span>
      </div>
    </button>
  );
}

function ReportModal({ target, onClose }: { target: DemoTarget; onClose: () => void }) {
  const failed = target.status === "fail";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[min(90vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-cardHover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <ScanEye size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{target.label}</h3>
                <span
                  className={`pill ${failed ? "bg-status-failBg text-status-fail" : "bg-status-passBg text-status-pass"}`}
                >
                  {failed ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
                  {failed ? "Violation" : "Compliant"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">{target.url}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {rulePackLabel[target.rulePack] ?? target.rulePack}
                </span>
                {target.violations.map((v) => (
                  <span
                    key={v}
                    className="rounded-md bg-status-failBg px-2 py-0.5 font-mono text-[11px] font-semibold text-status-fail"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`${BASE}/${target.slug}/index.html`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary py-2 text-xs"
            >
              <ExternalLink size={14} /> Open in new tab
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report"
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <iframe
          title={`${target.label} report`}
          src={`${BASE}/${target.slug}/index.html`}
          className="min-h-0 flex-1 w-full bg-slate-50"
        />
      </div>
    </div>
  );
}
