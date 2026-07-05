import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_ANALYSIS_ID } from "../lib/constants";

interface AnalysisContextValue {
  analysisId: string;
  setAnalysisId: (id: string) => void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

const STORAGE_KEY = "lumen.analysisId";

export function AnalysisProvider({ children }: { children: ReactNode }) {
  // Persist the selected project so a reload reopens the same one (the context
  // is the single source of truth for "which project is on screen").
  const [analysisId, setAnalysisIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ANALYSIS_ID;
    } catch {
      return DEFAULT_ANALYSIS_ID;
    }
  });

  const setAnalysisId = useCallback((id: string) => {
    setAnalysisIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Private-mode / storage-disabled: selection just won't persist.
    }
  }, []);

  const value = useMemo(() => ({ analysisId, setAnalysisId }), [analysisId, setAnalysisId]);
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used within AnalysisProvider");
  return ctx;
}
