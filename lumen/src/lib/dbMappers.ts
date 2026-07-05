import type {
  AppSummary,
  Insight,
  Issue,
  Journey,
  Screen,
  ScreenEdge,
  TestInvestigation,
  TestScenario,
} from "../types";

export interface AnalysisRow {
  id: string;
  app_name: string;
  app_url: string;
  analyzed_at: string;
  screens_discovered: number;
  user_flows: number;
  tests_executed: number;
  tests_passed: number;
  tests_failed: number;
  tests_not_executed: number;
  coverage_percent: number;
  critical_issues: number;
  exploration_log: string[];
  exploration_screen_order: string[];
}

export interface ScreenRow {
  id: string;
  analysis_id: string;
  name: string;
  type: Screen["type"];
  description: string;
  position: { x: number; y: number };
  status: Screen["status"];
  is_entry_point: boolean;
  accent: string;
  elements: Screen["elements"];
  navigation: Screen["navigation"];
  expected_actions: string[];
  test_case_ids: string[];
  issue_ids: string[];
}

export interface ScreenEdgeRow {
  id: string;
  analysis_id: string;
  source: string;
  target: string;
  label: string;
  status: ScreenEdge["status"];
}

export interface JourneyRow {
  id: string;
  analysis_id: string;
  name: string;
  description: string;
  status: Journey["status"];
  coverage: number;
  steps: Journey["steps"];
  test_case_ids: string[];
}

export interface TestRow {
  id: string;
  analysis_id: string;
  name: string;
  journey_id: string;
  screen_ids: string[];
  preconditions: string[];
  steps: TestScenario["steps"];
  expected_result: string;
  actual_result: string;
  status: TestScenario["status"];
  duration_ms: number;
  related_issue_ids: string[];
  has_investigation: boolean;
  repro_steps?: string[];
  script?: string | null;
}

export interface IssueRow {
  id: string;
  analysis_id: string;
  title: string;
  description: string;
  severity: Issue["severity"];
  related_screen_id: string;
  related_journey_id: string | null;
  suggested_fix: string;
  related_test_ids: string[];
  status: Issue["status"];
}

export interface InsightRow {
  id: string;
  analysis_id: string;
  title: string;
  category: Insight["category"];
  description: string;
  detail: string;
  severity: Insight["severity"];
  related_screen_id: string | null;
  related_journey_id: string | null;
  issue_id: string | null;
  suggested_fix: string | null;
}

export interface InvestigationRow {
  analysis_id: string;
  test_id: string;
  payload: TestInvestigation;
}

export function mapAnalysisRow(row: AnalysisRow): AppSummary {
  return {
    appName: row.app_name,
    appUrl: row.app_url,
    analyzedAt: row.analyzed_at,
    screensDiscovered: row.screens_discovered,
    userFlows: row.user_flows,
    testsExecuted: row.tests_executed,
    testsPassed: row.tests_passed,
    testsFailed: row.tests_failed,
    testsNotExecuted: row.tests_not_executed,
    coveragePercent: row.coverage_percent,
    criticalIssues: row.critical_issues,
  };
}

export function mapScreenRow(row: ScreenRow): Screen {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    position: row.position,
    status: row.status,
    isEntryPoint: row.is_entry_point,
    accent: row.accent,
    elements: row.elements,
    navigation: row.navigation,
    expectedActions: row.expected_actions,
    testCaseIds: row.test_case_ids,
    issueIds: row.issue_ids,
  };
}

export function mapScreenEdgeRow(row: ScreenEdgeRow): ScreenEdge {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    label: row.label,
    status: row.status,
  };
}

export function mapJourneyRow(row: JourneyRow): Journey {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    coverage: row.coverage,
    steps: row.steps,
    testCaseIds: row.test_case_ids,
  };
}

export function mapTestRow(row: TestRow): TestScenario {
  return {
    id: row.id,
    name: row.name,
    journeyId: row.journey_id,
    screenIds: row.screen_ids,
    preconditions: row.preconditions,
    steps: row.steps,
    expectedResult: row.expected_result,
    actualResult: row.actual_result,
    status: row.status,
    durationMs: row.duration_ms,
    relatedIssueIds: row.related_issue_ids,
    hasInvestigation: row.has_investigation,
    reproSteps: row.repro_steps ?? [],
    script: row.script ?? null,
  };
}

export function mapIssueRow(row: IssueRow): Issue {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    relatedScreenId: row.related_screen_id,
    relatedJourneyId: row.related_journey_id ?? undefined,
    suggestedFix: row.suggested_fix,
    relatedTestIds: row.related_test_ids,
    status: row.status,
  };
}

export function mapInsightRow(row: InsightRow): Insight {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    detail: row.detail,
    severity: row.severity,
    relatedScreenId: row.related_screen_id ?? undefined,
    relatedJourneyId: row.related_journey_id ?? undefined,
    issueId: row.issue_id ?? undefined,
    suggestedFix: row.suggested_fix ?? undefined,
  };
}
