import { requireSupabase } from "./supabase";
import {
  mapAnalysisRow,
  mapInsightRow,
  mapIssueRow,
  mapJourneyRow,
  mapScreenEdgeRow,
  mapScreenRow,
  mapTestRow,
  type AnalysisRow,
  type InsightRow,
  type IssueRow,
  type JourneyRow,
  type ScreenEdgeRow,
  type ScreenRow,
  type TestRow,
} from "./dbMappers";
import type { AppSummary, Insight, Issue, Journey, Screen, ScreenEdge, TestInvestigation, TestScenario } from "../types";

export interface AnalysisBundle {
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
}

export async function fetchAnalysisBundle(analysisId: string): Promise<AnalysisBundle> {
  const client = requireSupabase();

  const [
    analysisRes,
    screensRes,
    edgesRes,
    journeysRes,
    testsRes,
    issuesRes,
    insightsRes,
  ] = await Promise.all([
    client.from("analyses").select("*").eq("id", analysisId).single(),
    client.from("screens").select("*").eq("analysis_id", analysisId),
    client.from("screen_edges").select("*").eq("analysis_id", analysisId),
    client.from("journeys").select("*").eq("analysis_id", analysisId),
    client.from("tests").select("*").eq("analysis_id", analysisId),
    client.from("issues").select("*").eq("analysis_id", analysisId),
    client.from("insights").select("*").eq("analysis_id", analysisId),
  ]);

  if (analysisRes.error) throw analysisRes.error;
  if (screensRes.error) throw screensRes.error;
  if (edgesRes.error) throw edgesRes.error;
  if (journeysRes.error) throw journeysRes.error;
  if (testsRes.error) throw testsRes.error;
  if (issuesRes.error) throw issuesRes.error;
  if (insightsRes.error) throw insightsRes.error;

  const analysis = analysisRes.data as AnalysisRow;

  return {
    analysisId,
    appSummary: mapAnalysisRow(analysis),
    explorationLog: analysis.exploration_log ?? [],
    explorationScreenOrder: analysis.exploration_screen_order ?? [],
    screens: (screensRes.data as ScreenRow[]).map(mapScreenRow),
    screenEdges: (edgesRes.data as ScreenEdgeRow[]).map(mapScreenEdgeRow),
    journeys: (journeysRes.data as JourneyRow[]).map(mapJourneyRow),
    tests: (testsRes.data as TestRow[]).map(mapTestRow),
    issues: (issuesRes.data as IssueRow[]).map(mapIssueRow),
    insights: (insightsRes.data as InsightRow[]).map(mapInsightRow),
  };
}

/**
 * Fill in any sections a stored investigation payload is missing. Payloads
 * written live during a run (streamed on test failure) carry only what was
 * known at that moment — logs/network/timeline — while the full package
 * (replay, evidence, environment) lands at publish time. Rendering must never
 * crash on a partial payload, so every section gets a safe default here.
 */
function normalizeInvestigation(raw: Partial<TestInvestigation>, testId: string): TestInvestigation {
  return {
    testId: raw.testId ?? testId,
    recordedReason: raw.recordedReason ?? "",
    analysis: raw.analysis,
    replay: raw.replay ?? { durationMs: 0, frames: [] },
    evidence: raw.evidence ?? [],
    network: raw.network ?? [],
    logs: raw.logs ?? [],
    timeline: raw.timeline ?? [],
    comparison: raw.comparison ?? [],
    environment: raw.environment ?? {
      device: "Desktop",
      os: "unknown",
      appVersion: "unknown",
      orientation: "landscape",
      theme: "light",
      network: "online",
      timestamp: new Date().toISOString(),
    },
  };
}

export async function fetchInvestigation(
  analysisId: string,
  testId: string,
): Promise<TestInvestigation | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("investigations")
    .select("payload")
    .eq("analysis_id", analysisId)
    .eq("test_id", testId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.payload) return null;
  return normalizeInvestigation(data.payload as Partial<TestInvestigation>, testId);
}

export async function fetchInvestigationsMap(
  analysisId: string,
): Promise<Record<string, TestInvestigation>> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("investigations")
    .select("test_id, payload")
    .eq("analysis_id", analysisId);

  if (error) throw error;
  const map: Record<string, TestInvestigation> = {};
  for (const row of data ?? []) {
    map[row.test_id] = normalizeInvestigation(
      row.payload as Partial<TestInvestigation>,
      row.test_id as string,
    );
  }
  return map;
}

export async function updateIssueStatus(
  analysisId: string,
  issueId: string,
  status: Issue["status"],
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("issues")
    .update({ status })
    .eq("analysis_id", analysisId)
    .eq("id", issueId);
  if (error) throw error;
}

export async function updateTestStatus(
  analysisId: string,
  testId: string,
  status: TestScenario["status"],
  actualResult = "",
  durationMs = 0,
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("tests")
    .update({ status, actual_result: actualResult, duration_ms: durationMs })
    .eq("analysis_id", analysisId)
    .eq("id", testId);
  if (error) throw error;
}

export interface CreateAnalysisInput {
  id: string;
  appUrl: string;
  appName?: string;
}

export async function createAnalysis(input: CreateAnalysisInput): Promise<string> {
  const client = requireSupabase();
  const appName =
    input.appName ??
    (() => {
      try {
        return new URL(input.appUrl).hostname.replace(/^www\./, "");
      } catch {
        return "New App";
      }
    })();

  // Upsert, not insert: a project is keyed by its URL-derived id, so re-running
  // the same URL must reuse (and reset) its existing row instead of failing on a
  // primary-key conflict. The daemon re-clears child rows when the run starts.
  const { error } = await client.from("analyses").upsert(
    {
      id: input.id,
      app_name: appName,
      app_url: input.appUrl,
      analyzed_at: new Date().toISOString(),
      screens_discovered: 0,
      user_flows: 0,
      tests_executed: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_not_executed: 0,
      coverage_percent: 0,
      critical_issues: 0,
      exploration_log: [],
      exploration_screen_order: [],
    },
    { onConflict: "id" },
  );

  if (error) throw error;
  return input.id;
}

export interface ProjectRow {
  id: string;
  app_name: string;
  app_url: string;
  analyzed_at: string;
}

/** Every analyzed project, most recent first, for the project switcher. */
export async function fetchProjects(): Promise<ProjectRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("analyses")
    .select("id, app_name, app_url, analyzed_at")
    .order("analyzed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectRow[];
}

export async function updateAnalysisSummary(
  analysisId: string,
  patch: Partial<AppSummary> & {
    explorationLog?: string[];
    explorationScreenOrder?: string[];
  },
): Promise<void> {
  const client = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.appName !== undefined) row.app_name = patch.appName;
  if (patch.appUrl !== undefined) row.app_url = patch.appUrl;
  if (patch.analyzedAt !== undefined) row.analyzed_at = patch.analyzedAt;
  if (patch.screensDiscovered !== undefined) row.screens_discovered = patch.screensDiscovered;
  if (patch.userFlows !== undefined) row.user_flows = patch.userFlows;
  if (patch.testsExecuted !== undefined) row.tests_executed = patch.testsExecuted;
  if (patch.testsPassed !== undefined) row.tests_passed = patch.testsPassed;
  if (patch.testsFailed !== undefined) row.tests_failed = patch.testsFailed;
  if (patch.testsNotExecuted !== undefined) row.tests_not_executed = patch.testsNotExecuted;
  if (patch.coveragePercent !== undefined) row.coverage_percent = patch.coveragePercent;
  if (patch.criticalIssues !== undefined) row.critical_issues = patch.criticalIssues;
  if (patch.explorationLog !== undefined) row.exploration_log = patch.explorationLog;
  if (patch.explorationScreenOrder !== undefined) {
    row.exploration_screen_order = patch.explorationScreenOrder;
  }

  const { error } = await client.from("analyses").update(row).eq("id", analysisId);
  if (error) throw error;
}
