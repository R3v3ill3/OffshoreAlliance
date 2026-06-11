-- Subjective organiser rating for an organising unit / sub-unit: a standalone
-- 1..5 scale (1 = extremely strong … 5 = hostile), independent of worker
-- assessment ratings. A group container keeps its own rating; the UI also shows
-- the average of its sub-units' ratings.
ALTER TABLE campaign_organising_units
  ADD COLUMN IF NOT EXISTS user_rating SMALLINT
    CHECK (user_rating IS NULL OR (user_rating BETWEEN 1 AND 5));

COMMENT ON COLUMN campaign_organising_units.user_rating IS
  'Subjective organiser rating of the unit: 1 (extremely strong) .. 5 (hostile). '
  'Independent of worker assessment ratings and of any sub-unit ratings.';
