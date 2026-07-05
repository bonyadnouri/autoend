import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnalysisBundle, fetchInvestigationsMap } from "../lib/api";
import { isSupabaseConfigured } from "../lib/supabase";
import { mockAnalysisBundle, mockInvestigations } from "../lib/mockFallback";
import type {
  Insight,
  Issue,
  Journey,
  Screen,
  TestInvestigation,
  TestScenario,
} from "../types";
import type { AppSummary, ScreenEdge } from "../types";
import { useAnalysis } from "./AnalysisContext";

export interface AnalysisDataContextValue {
  source: "supabase" | "mock";
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  analysisId: string;
  appSummary: AppSummary;
  explorationLog: string[];
  explorationScreenOrder: string[];
  screens: Screen[];
  screenEdges: ScreenEdge[];
  journeys: Journey[];
  tests: TestScenario[];
  issues: Issue[];
  insights: Insight[];
  investigations: Record<string, TestInvestigation>;
  getScreen: (id: string) => Screen | undefined;
  getJourney: (id: string) => Journey | undefined;
  getTest: (id: string) => TestScenario | undefined;
  getIssue: (id: string) => Issue | undefined;
  getInsight: (id: string) => Insight | undefined;
  getInvestigation: (testId: string) => TestInvestigation | undefined;
}

const AnalysisDataContext = createContext<AnalysisDataContextValue | null>(null);

export function AnalysisDataProvider({ children }: { children: ReactNode }) {
  const { analysisId } = useAnalysis();

  const bundleQuery = useQuery({
    queryKey: ["analysis-bundle", analysisId],
    queryFn: () => fetchAnalysisBundle(analysisId),
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
  });

  const investigationsQuery = useQuery({
    queryKey: ["investigations", analysisId],
    queryFn: () => fetchInvestigationsMap(analysisId),
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
  });

  const useMock = !isSupabaseConfigured;
  const bundle = useMock ? mockAnalysisBundle : bundleQuery.data;
  const investigations = useMock
    ? mockInvestigations
    : (investigationsQuery.data ?? {});

  const isLoading =
    !useMock && (bundleQuery.isLoading || investigationsQuery.isLoading);
  const error =
    !useMock && (bundleQuery.error || investigationsQuery.error)
      ? ((bundleQuery.error ?? investigationsQuery.error) as Error)
      : null;

  const refetch = useCallback(() => {
    bundleQuery.refetch();
    investigationsQuery.refetch();
  }, [bundleQuery, investigationsQuery]);

  const getScreen = useCallback(
    (id: string) => bundle?.screens.find((s) => s.id === id),
    [bundle?.screens],
  );
  const getJourney = useCallback(
    (id: string) => bundle?.journeys.find((j) => j.id === id),
    [bundle?.journeys],
  );
  const getTest = useCallback(
    (id: string) => bundle?.tests.find((t) => t.id === id),
    [bundle?.tests],
  );
  const getIssue = useCallback(
    (id: string) => bundle?.issues.find((i) => i.id === id),
    [bundle?.issues],
  );
  const getInsight = useCallback(
    (id: string) => bundle?.insights.find((i) => i.id === id),
    [bundle?.insights],
  );
  const getInvestigation = useCallback(
    (testId: string) => investigations[testId],
    [investigations],
  );

  const value = useMemo<AnalysisDataContextValue | null>(() => {
    if (!bundle) return null;
    return {
      source: useMock ? "mock" : "supabase",
      isLoading,
      error,
      refetch,
      analysisId: bundle.analysisId,
      appSummary: bundle.appSummary,
      explorationLog: bundle.explorationLog,
      explorationScreenOrder: bundle.explorationScreenOrder,
      screens: bundle.screens,
      screenEdges: bundle.screenEdges,
      journeys: bundle.journeys,
      tests: bundle.tests,
      issues: bundle.issues,
      insights: bundle.insights,
      investigations,
      getScreen,
      getJourney,
      getTest,
      getIssue,
      getInsight,
      getInvestigation,
    };
  }, [
    bundle,
    useMock,
    isLoading,
    error,
    refetch,
    investigations,
    getScreen,
    getJourney,
    getTest,
    getIssue,
    getInsight,
    getInvestigation,
  ]);

  if (!value) {
    if (isLoading) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-600">
          Loading analysis data…
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
          <p className="text-slate-800">Could not load analysis data.</p>
          <p className="text-sm text-slate-500">{error.message}</p>
          <button type="button" className="btn-primary" onClick={refetch}>
            Retry
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <AnalysisDataContext.Provider value={value}>{children}</AnalysisDataContext.Provider>
  );
}

export function useAnalysisData() {
  const ctx = useContext(AnalysisDataContext);
  if (!ctx) throw new Error("useAnalysisData must be used within AnalysisDataProvider");
  return ctx;
}

/** For routes outside the main layout (start / exploring) that only need summary fields. */
export function useOptionalAnalysisData(): AnalysisDataContextValue | null {
  return useContext(AnalysisDataContext);
}
