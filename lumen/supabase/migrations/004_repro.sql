-- Store reproduction data on each test so a run is reproducible from the UI /
-- another machine: repro_steps is the human-readable numbered recipe, script is
-- the exact executable Playwright flow autoend replays.

ALTER TABLE tests ADD COLUMN IF NOT EXISTS repro_steps JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS script TEXT;
