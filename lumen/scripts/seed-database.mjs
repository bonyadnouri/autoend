/**
 * Seeds the ShopFlow demo dataset into Supabase.
 * Usage: npm run db:seed
 * Requires: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const ANALYSIS_ID = "shopflow-default";

register();

const mockData = await import("../src/data/mockData.ts");
const investigations = await import("../src/data/investigations.ts");

const supabase = createClient(url, key);
const {
  appSummary,
  screens,
  screenEdges,
  journeys,
  tests,
  issues,
  insights,
  explorationLog,
  explorationScreenOrder,
} = mockData;

const investigationIds = new Set(Object.keys(investigations.investigations));

console.log("Clearing existing shopflow-default data...");
await supabase.from("analyses").delete().eq("id", ANALYSIS_ID);

console.log("Inserting analysis...");
const { error: analysisError } = await supabase.from("analyses").insert({
  id: ANALYSIS_ID,
  app_name: appSummary.appName,
  app_url: appSummary.appUrl,
  analyzed_at: appSummary.analyzedAt,
  screens_discovered: appSummary.screensDiscovered,
  user_flows: appSummary.userFlows,
  tests_executed: appSummary.testsExecuted,
  tests_passed: appSummary.testsPassed,
  tests_failed: appSummary.testsFailed,
  tests_not_executed: appSummary.testsNotExecuted,
  coverage_percent: appSummary.coveragePercent,
  critical_issues: appSummary.criticalIssues,
  exploration_log: explorationLog,
  exploration_screen_order: explorationScreenOrder,
});
if (analysisError) throw analysisError;

const { error: screensError } = await supabase.from("screens").insert(
  screens.map((s) => ({
    id: s.id,
    analysis_id: ANALYSIS_ID,
    name: s.name,
    type: s.type,
    description: s.description,
    position: s.position,
    status: s.status,
    is_entry_point: s.isEntryPoint,
    accent: s.accent,
    elements: s.elements,
    navigation: s.navigation,
    expected_actions: s.expectedActions,
    test_case_ids: s.testCaseIds,
    issue_ids: s.issueIds,
  })),
);
if (screensError) throw screensError;

const { error: edgesError } = await supabase.from("screen_edges").insert(
  screenEdges.map((e) => ({
    id: e.id,
    analysis_id: ANALYSIS_ID,
    source: e.source,
    target: e.target,
    label: e.label,
    status: e.status,
  })),
);
if (edgesError) throw edgesError;

const { error: journeysError } = await supabase.from("journeys").insert(
  journeys.map((j) => ({
    id: j.id,
    analysis_id: ANALYSIS_ID,
    name: j.name,
    description: j.description,
    status: j.status,
    coverage: j.coverage,
    steps: j.steps,
    test_case_ids: j.testCaseIds,
  })),
);
if (journeysError) throw journeysError;

const { error: testsError } = await supabase.from("tests").insert(
  tests.map((t) => ({
    id: t.id,
    analysis_id: ANALYSIS_ID,
    name: t.name,
    journey_id: t.journeyId,
    screen_ids: t.screenIds,
    preconditions: t.preconditions,
    steps: t.steps,
    expected_result: t.expectedResult,
    actual_result: t.actualResult,
    status: t.status,
    duration_ms: t.durationMs,
    related_issue_ids: t.relatedIssueIds,
    has_investigation: investigationIds.has(t.id),
  })),
);
if (testsError) throw testsError;

const { error: issuesError } = await supabase.from("issues").insert(
  issues.map((i) => ({
    id: i.id,
    analysis_id: ANALYSIS_ID,
    title: i.title,
    description: i.description,
    severity: i.severity,
    related_screen_id: i.relatedScreenId,
    related_journey_id: i.relatedJourneyId ?? null,
    suggested_fix: i.suggestedFix,
    related_test_ids: i.relatedTestIds,
    status: i.status,
  })),
);
if (issuesError) throw issuesError;

const { error: insightsError } = await supabase.from("insights").insert(
  insights.map((i) => ({
    id: i.id,
    analysis_id: ANALYSIS_ID,
    title: i.title,
    category: i.category,
    description: i.description,
    detail: i.detail,
    severity: i.severity,
    related_screen_id: i.relatedScreenId ?? null,
    related_journey_id: i.relatedJourneyId ?? null,
    issue_id: i.issueId ?? null,
  })),
);
if (insightsError) throw insightsError;

const invRows = Object.entries(investigations.investigations).map(([testId, payload]) => ({
  analysis_id: ANALYSIS_ID,
  test_id: testId,
  payload,
}));

const { error: invError } = await supabase.from("investigations").insert(invRows);
if (invError) throw invError;

console.log("Seed complete for analysis:", ANALYSIS_ID);
