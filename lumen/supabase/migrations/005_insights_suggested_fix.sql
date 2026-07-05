-- Give each AI insight an actionable next step. autoend's publish step derives a
-- suggested fix per finding (preferring the filing agent's own diagnosis), and
-- the Insights page renders it so a reader always knows what to do about an
-- observation, not just that it exists.

ALTER TABLE insights ADD COLUMN IF NOT EXISTS suggested_fix TEXT;
