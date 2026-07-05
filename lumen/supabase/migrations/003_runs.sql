-- Run queue + live event stream for autoend ↔ Lumen integration

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'full',
  test_id TEXT,
  effort TEXT,
  target_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  summary JSONB
);

CREATE TABLE run_events (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, seq)
);

ALTER TABLE tests ADD COLUMN IF NOT EXISTS last_run_id TEXT;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS previously_passed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE screens ADD COLUMN IF NOT EXISTS last_run_id TEXT;

CREATE INDEX idx_runs_analysis ON runs(analysis_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_run_events_run ON run_events(run_id);

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_runs" ON runs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_run_events" ON run_events FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE runs;
ALTER PUBLICATION supabase_realtime ADD TABLE run_events;
ALTER PUBLICATION supabase_realtime ADD TABLE screens;
ALTER PUBLICATION supabase_realtime ADD TABLE screen_edges;
ALTER PUBLICATION supabase_realtime ADD TABLE tests;
