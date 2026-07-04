import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, FileJson, ClipboardCopy, Check } from "lucide-react";
import type { Environment, FaultDomain, Finding } from "../../types";
import { KIND_LABEL } from "../../data/helpers";

interface Props {
  finding: Finding;
  runId: string;
  target: string;
  environment: Environment;
}

const faultLabel: Record<FaultDomain, string> = {
  app: "App",
  flow: "Flow",
  environment: "Environment",
};

/** The portable Finding export: the whole Finding, wrapped with its Run provenance. */
function buildReport(finding: Finding, runId: string, target: string) {
  return {
    generatedAt: new Date().toISOString(),
    runId,
    target,
    finding,
  };
}

/** A markdown summary of the Finding, clipboard-ready to paste into any tracker. */
function buildTextSummary(finding: Finding, env: Environment): string {
  const lines = [`## ${KIND_LABEL[finding.kind]}: ${finding.title}`, "", finding.detail];

  const d = finding.diagnosis;
  if (d) {
    lines.push(
      "",
      `**Diagnosis:** ${d.rootCause} — ${faultLabel[d.faultDomain]} fault, ${d.confidence}% confidence`,
    );
  }

  lines.push(
    "",
    `**Environment:** ${env.browser} · ${env.viewport} · ${env.os} · Node ${env.node} · autoend ${env.autoendVersion}`,
  );

  const shots = finding.screenshots?.length ?? 0;
  const evidence = [`${shots} screenshots`];
  if (finding.evidence) evidence.push("video");
  lines.push(`**Evidence:** ${evidence.join(", ")}`);

  return lines.join("\n");
}

export function ExportMenu({ finding, runId, target, environment }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
    a.download = `${finding.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(buildTextSummary(finding, environment));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable in some sandboxes */
    }
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
            subtitle="Finding export (.json)"
            onClick={downloadJson}
          />
          <MenuItem
            icon={copied ? Check : ClipboardCopy}
            title={copied ? "Copied!" : "Copy summary"}
            subtitle="Markdown for any tracker"
            onClick={copySummary}
          />
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
