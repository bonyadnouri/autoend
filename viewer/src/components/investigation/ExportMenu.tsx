import { useEffect, useRef, useState } from "react";
import {
  Download,
  ChevronDown,
  FileJson,
  Ticket,
  ClipboardCopy,
  Check,
  ExternalLink,
  X,
} from "lucide-react";
import type { Finding } from "../../types";

interface Props {
  finding: Finding;
  runId: string;
  target: string;
}

function buildReport(finding: Finding, runId: string, target: string) {
  return {
    generatedAt: new Date().toISOString(),
    runId,
    target,
    finding: {
      id: finding.id,
      kind: finding.kind,
      title: finding.title,
      detail: finding.detail,
      flowId: finding.flowId,
    },
    diagnosis: finding.diagnosis,
    timeline: finding.timeline,
    network: finding.network,
    console: finding.console,
    screenshots: finding.screenshots,
  };
}

function buildTextSummary(finding: Finding, runId: string, target: string): string {
  const d = finding.diagnosis;
  const lines = [
    `Finding ${finding.id} — ${finding.title}`,
    `Run: ${runId}`,
    `Target: ${target}`,
    `Kind: ${finding.kind}`,
    d ? `Root cause: ${d.rootCause}` : "",
    d ? `Confidence: ${d.confidence}% (${d.faultDomain})` : "",
    "",
    finding.detail,
  ];
  return lines.filter(Boolean).join("\n");
}

export function ExportMenu({ finding, runId, target }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ticket, setTicket] = useState<{ key: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function downloadJson() {
    const report = buildReport(finding, runId, target);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${finding.id}-finding.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildTextSummary(finding, runId, target));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable in some sandboxes */
    }
    setOpen(false);
  }

  function createTicket() {
    const key = `AE-${1400 + Math.floor(Math.random() * 600)}`;
    setTicket({ key });
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>
        <Download size={16} /> Export
        <ChevronDown size={15} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-cardHover">
          <MenuItem
            icon={FileJson}
            title="Download JSON"
            subtitle="Full Finding as .json"
            onClick={downloadJson}
          />
          <MenuItem
            icon={Ticket}
            title="Create ticket"
            subtitle="Attach the Finding (mock)"
            onClick={createTicket}
          />
          <MenuItem
            icon={copied ? Check : ClipboardCopy}
            title={copied ? "Copied!" : "Copy summary"}
            subtitle="Plain-text summary to clipboard"
            onClick={copyReport}
          />
        </div>
      )}

      {ticket && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setTicket(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-cardHover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-status-passBg text-status-pass">
                  <Check size={18} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Ticket created</h3>
                  <p className="text-xs text-slate-500">Mock integration - no external call made</p>
                </div>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setTicket(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <span className="font-mono text-sm font-bold text-brand-700">{ticket.key}</span>
              <p className="mt-2 text-sm font-medium text-slate-800">{finding.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                Diagnosis, network, console and screenshots attached.
              </p>
              <a
                href="#"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                onClick={(e) => e.preventDefault()}
              >
                Open ticket <ExternalLink size={14} />
              </a>
            </div>

            <div className="mt-5 flex justify-end">
              <button className="btn-primary" onClick={() => setTicket(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof FileJson;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
      onClick={onClick}
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
        <Icon size={16} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{subtitle}</span>
      </span>
    </button>
  );
}
