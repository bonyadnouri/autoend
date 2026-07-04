import { useState } from "react";
import { Ban, BellOff, Undo2, type LucideIcon } from "lucide-react";
import { useReport } from "../data/report";
import type { Resolution } from "../types";

/**
 * The three resolution actions (CONTEXT.md): Dismiss a Regression, Suppress an
 * Advisory, Reject a Heal. Each POSTs to the thin server against the live Flow
 * Map. Hidden entirely when the Report is viewed away from its repo
 * (`capabilities.resolutionActions` false). Reject is intentionally 501 until
 * Heals are produced — its server error surfaces inline, which is correct.
 */
export type ResolutionAction = "dismiss" | "suppress" | "reject";

interface ActionMeta {
  label: string;
  icon: LucideIcon;
  resolution: Resolution;
  warning?: string;
}

const META: Record<ResolutionAction, ActionMeta> = {
  dismiss: {
    label: "Dismiss Regression",
    icon: Ban,
    resolution: "dismissed",
    warning: "Dismissing deletes the Flow from the Flow Map.",
  },
  suppress: {
    label: "Suppress Advisory",
    icon: BellOff,
    resolution: "suppressed",
  },
  reject: {
    label: "Reject Heal",
    icon: Undo2,
    resolution: "rejected",
  },
};

interface Props {
  /** Finding id for dismiss/suppress; the Heal's flowId for reject. */
  id: string;
  action: ResolutionAction;
  onResolved?: (resolution: Resolution) => void;
}

export function ResolutionActions({ id, action, onResolved }: Props) {
  const { capabilities } = useReport();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!capabilities.resolutionActions || done) return null;

  const meta = META[action];
  const Icon = meta.icon;

  async function run() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`api/findings/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
      });
      if (res.ok) {
        setDone(true);
        onResolved?.(meta.resolution);
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Request failed (${res.status}).`);
      }
    } catch {
      setError("Could not reach the Report server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className="btn-secondary" onClick={run} disabled={pending}>
        <Icon size={15} /> {meta.label}
      </button>
      {meta.warning && <p className="mt-2 text-xs text-slate-500">{meta.warning}</p>}
      {error && <p className="mt-2 text-xs font-medium text-status-fail">{error}</p>}
    </div>
  );
}
