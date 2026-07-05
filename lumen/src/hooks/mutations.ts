import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createAnalysis,
  updateAnalysisSummary,
  updateIssueStatus,
  updateTestStatus,
} from "../lib/api";
import type { AppSummary, Issue, TestScenario } from "../types";
import { useAnalysis } from "../context/AnalysisContext";

export function useUpdateIssueStatus() {
  const { analysisId } = useAnalysis();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, status }: { issueId: string; status: Issue["status"] }) =>
      updateIssueStatus(analysisId, issueId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-bundle", analysisId] });
    },
  });
}

export function useUpdateTestStatus() {
  const { analysisId } = useAnalysis();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      testId,
      status,
      actualResult,
      durationMs,
    }: {
      testId: string;
      status: TestScenario["status"];
      actualResult?: string;
      durationMs?: number;
    }) => updateTestStatus(analysisId, testId, status, actualResult, durationMs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-bundle", analysisId] });
    },
  });
}

export function useCreateAnalysis() {
  const { setAnalysisId } = useAnalysis();
  const queryClient = useQueryClient();

  return useMutation({
    // The id is derived from the URL by the caller (analysisIdForUrl) so the
    // same URL reuses its project; createAnalysis upserts it.
    mutationFn: ({ id, appUrl, appName }: { id: string; appUrl: string; appName?: string }) =>
      createAnalysis({ id, appUrl, appName }),
    onSuccess: (id) => {
      setAnalysisId(id);
      queryClient.invalidateQueries({ queryKey: ["analysis-bundle", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateAnalysisSummary() {
  const { analysisId } = useAnalysis();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      patch: Partial<AppSummary> & {
        explorationLog?: string[];
        explorationScreenOrder?: string[];
      },
    ) => updateAnalysisSummary(analysisId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-bundle", analysisId] });
    },
  });
}
