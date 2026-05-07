-- Add per-assessment custom rating label overrides to campaign_activities.
-- Keys are "1"–"5"; any missing key falls back to the global rating_level defaults.
-- The column is nullable — NULL means "use the default labels".

ALTER TABLE campaign_activities
  ADD COLUMN IF NOT EXISTS rating_labels JSONB NULL;

COMMENT ON COLUMN campaign_activities.rating_labels IS
  'Optional per-level label overrides for the 1–5 rating scale.
   Keys are "1"–"5"; any missing key falls back to the global rating_level defaults.
   Example: {"1":"Will vote No and encourage others","2":"Likely to vote No","3":"Unsure","4":"Likely to vote Yes","5":"Will vote Yes and encourage others"}';
