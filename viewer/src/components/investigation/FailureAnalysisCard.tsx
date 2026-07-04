import { Stethoscope, Crosshair, Cpu } from "lucide-react";
import type { Diagnosis, FaultDomain } from "../../types";
import { ConfidenceMeter } from "./ConfidenceMeter";

const domainLabel: Record<FaultDomain, string> = {
  app: "App",
  flow: "Flow",
  environment: "Environment",
};

const domainTone: Record<FaultDomain, string> = {
  app: "bg-sky-100 text-sky-700",
  flow: "bg-violet-100 text-violet-700",
  environment: "bg-amber-100 text-amber-700",
};

export function FailureAnalysisCard({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
    <section className="card overflow-hidden border-l-4 border-l-status-ai">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-status-aiBg/40 px-5 py-3">
        <Stethoscope size={17} className="text-status-ai" />
        <h2 className="text-sm font-semibold text-status-ai">Diagnosis</h2>
        <span className={`pill ml-auto ${domainTone[diagnosis.faultDomain]}`}>
          <Cpu size={13} />
          {domainLabel[diagnosis.faultDomain]} fault
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-start gap-2">
            <Crosshair size={16} className="mt-0.5 shrink-0 text-status-fail" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Root cause
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{diagnosis.rootCause}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <ConfidenceMeter value={diagnosis.confidence} />
        </div>
      </div>
    </section>
  );
}
