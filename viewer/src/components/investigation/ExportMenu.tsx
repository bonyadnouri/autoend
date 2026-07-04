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
import type { TestInvestigation, TestScenario } from "../../types";

interface Props {
  test: TestScenario;
  investigation: TestInvestigation;
}

function buildReport(test: TestScenario, investigation: TestInvestigation) {
  return {
    generatedAt: new Date().toISOString(),
    test: {
      id: test.id,
      name: test.name,
      status: test.status,
      journeyId: test.journeyId,
      expectedResult: test.expectedResult,
      actualResult: test.actualResult,
    },
    analysis: investigation.analysis,
    expectedVsActual: investigation.comparison,
    timeline: investigation.timeline,
    network: investigation.network,
    logs: investigation.logs,
    evidence: investigation.evidence,
    environment: investigation.environment,
    replay: { durationMs: investigation.replay.durationMs, frames: investigation.replay.frames.length },
  };
}

function buildTextSummary(test: TestScenario, investigation: TestInvestigation): string {
  const a = investigation.analysis;
  const lines = [
    `Bug report: ${test.id} - ${test.name}`,
    `Status: ${test.status.toUpperCase()}`,
    a ? `Root cause: ${a.rootCause}` : "",
    a ? `Confidence: ${a.confidence}% (${a.faultDomain})` : "",
    "",
    "Expected vs actual:",
    ...investigation.comparison.map((c) => `- ${c.aspect}: expected "${c.expected}", actual "${c.actual}"`),
    "",
    `Environment: ${investigation.environment.device}, ${investigation.environment.os}, ${investigation.environment.appVersion}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function ExportMenu({ test, investigation }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jira, setJira] = useState<{ key: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function downloadJson() {
    const report = buildReport(test, investigation);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${test.id}-bug-report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildTextSummary(test, investigation));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable in some sandboxes */
    }
    setOpen(false);
  }

  function createJira() {
    const key = `QA-${1400 + Math.floor(Math.random() * 600)}`;
    setJira({ key });
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
          <MenuItem icon={FileJson} title="Download JSON" subtitle="Full bug report as .json" onClick={downloadJson} />
          <MenuItem icon={Ticket} title="Create Jira ticket" subtitle="Attach evidence package (mock)" onClick={createJira} />
          <MenuItem
            icon={copied ? Check : ClipboardCopy}
            title={copied ? "Copied!" : "Copy summary"}
            subtitle="Plain-text summary to clipboard"
            onClick={copyReport}
          />
        </div>
      )}

      {jira && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setJira(null)}>
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
                  <h3 className="text-base font-bold text-slate-900">Jira ticket created</h3>
                  <p className="text-xs text-slate-500">Mock integration - no external call made</p>
                </div>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setJira(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-brand-700">{jira.key}</span>
                <span className="pill bg-status-failBg text-status-fail">Bug</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-800">{test.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                Evidence package, network, logs and AI analysis attached.
              </p>
              <a
                href={`https://shopflow.atlassian.net/browse/${jira.key}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                onClick={(e) => e.preventDefault()}
              >
                Open in Jira <ExternalLink size={14} />
              </a>
            </div>

            <div className="mt-5 flex justify-end">
              <button className="btn-primary" onClick={() => setJira(null)}>
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
    <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={onClick}>
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
