-- Lumen analysis schema (hackathon demo — open RLS policies)

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  app_name TEXT NOT NULL,
  app_url TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL,
  screens_discovered INT NOT NULL DEFAULT 0,
  user_flows INT NOT NULL DEFAULT 0,
  tests_executed INT NOT NULL DEFAULT 0,
  tests_passed INT NOT NULL DEFAULT 0,
  tests_failed INT NOT NULL DEFAULT 0,
  tests_not_executed INT NOT NULL DEFAULT 0,
  coverage_percent INT NOT NULL DEFAULT 0,
  critical_issues INT NOT NULL DEFAULT 0,
  exploration_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  exploration_screen_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screens (
  id TEXT NOT NULL,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  position JSONB NOT NULL,
  status TEXT NOT NULL,
  is_entry_point BOOLEAN NOT NULL DEFAULT false,
  accent TEXT NOT NULL,
  elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  navigation JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_case_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  issue_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (analysis_id, id)
);

CREATE TABLE IF NOT EXISTS screen_edges (
  id TEXT NOT NULL,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (analysis_id, id)
);

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT NOT NULL,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  coverage INT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_case_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (analysis_id, id)
);

CREATE TABLE IF NOT EXISTS tests (
  id TEXT NOT NULL,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  journey_id TEXT NOT NULL,
  screen_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  preconditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_result TEXT NOT NULL,
  actual_result TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  related_issue_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_investigation BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (analysis_id, id)
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT NOT NULL,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  related_screen_id TEXT NOT NULL,
  related_journey_id TEXT,
  suggested_fix TEXT NOT NULL,
  related_test_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  PRIMARY KEY (analysis_id, id)
);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT NOT NULL,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL,
  related_screen_id TEXT,
  related_journey_id TEXT,
  issue_id TEXT,
  PRIMARY KEY (analysis_id, id)
);

CREATE TABLE IF NOT EXISTS investigations (
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (analysis_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_screens_analysis ON screens(analysis_id);
CREATE INDEX IF NOT EXISTS idx_journeys_analysis ON journeys(analysis_id);
CREATE INDEX IF NOT EXISTS idx_tests_analysis ON tests(analysis_id);
CREATE INDEX IF NOT EXISTS idx_issues_analysis ON issues(analysis_id);
CREATE INDEX IF NOT EXISTS idx_insights_analysis ON insights(analysis_id);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;

-- Postgres CREATE POLICY has no IF NOT EXISTS, so drop-then-create keeps this
-- migration idempotent (safe to re-run).

DROP POLICY IF EXISTS "anon_all_analyses" ON analyses;
CREATE POLICY "anon_all_analyses" ON analyses FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_screens" ON screens;
CREATE POLICY "anon_all_screens" ON screens FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_screen_edges" ON screen_edges;
CREATE POLICY "anon_all_screen_edges" ON screen_edges FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_journeys" ON journeys;
CREATE POLICY "anon_all_journeys" ON journeys FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_tests" ON tests;
CREATE POLICY "anon_all_tests" ON tests FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_issues" ON issues;
CREATE POLICY "anon_all_issues" ON issues FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_insights" ON insights;
CREATE POLICY "anon_all_insights" ON insights FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_investigations" ON investigations;
CREATE POLICY "anon_all_investigations" ON investigations FOR ALL TO anon USING (true) WITH CHECK (true);
