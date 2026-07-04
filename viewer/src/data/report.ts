import { createContext, createElement, useContext, type ReactNode } from "react";
import type { RunArtifact } from "../types";

export interface Capabilities {
  resolutionActions: boolean;
}

export interface ReportData {
  artifact: RunArtifact;
  capabilities: Capabilities;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Load the Run artifact + capabilities the way the thin server (dev middleware
 * or `serveReport`) and plain static hosting both expose them. Paths are
 * relative so a Report served beside its own report.json resolves correctly.
 */
export async function loadReport(): Promise<ReportData> {
  const artifact = (await fetchJson("api/report")) ?? (await fetchJson("report.json"));
  if (!artifact) throw new Error("Could not load report.json for this Run.");

  const caps = await fetchJson("api/capabilities");
  const capabilities: Capabilities =
    caps && typeof (caps as Capabilities).resolutionActions === "boolean"
      ? (caps as Capabilities)
      : { resolutionActions: false };

  return { artifact: artifact as RunArtifact, capabilities };
}

const ReportContext = createContext<ReportData | null>(null);

export function ReportProvider({
  data,
  children,
}: {
  data: ReportData;
  children: ReactNode;
}) {
  return createElement(ReportContext.Provider, { value: data }, children);
}

export function useReport(): ReportData {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReport must be used within a ReportProvider");
  return ctx;
}

/** Evidence lives beside report.json in evidence/; keep the URL relative. */
export function evidenceUrl(file: string): string {
  return `evidence/${file}`;
}
