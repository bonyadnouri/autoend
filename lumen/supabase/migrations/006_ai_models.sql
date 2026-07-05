-- Per-run model selection. The autoend daemon (which holds the Cursor API key)
-- publishes the account's available models into ai_models; the UI reads them to
-- offer a live picker and writes the chosen id onto the queued run so the daemon
-- runs every agent on exactly that model.

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE runs ADD COLUMN IF NOT EXISTS model TEXT;

-- Open anon read+write, consistent with every other Lumen table (see the
-- SECURITY NOTE in autoend/src/publish/supabase-client.ts): the daemon publishes
-- models using the anon key, not a service_role key, so anon must be able to
-- write here. This is a demo posture — point Lumen only at throwaway Supabase
-- projects, never one holding real data. Tighten to a service_role writer +
-- anon-read split before any real deployment.
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_models' AND policyname = 'ai_models_all'
  ) THEN
    CREATE POLICY ai_models_all ON ai_models FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ai_models'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_models;
  END IF;
END $$;
