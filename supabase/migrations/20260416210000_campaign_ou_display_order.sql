-- Per-campaign ordering for organising units (wall chart and structure UI).

ALTER TABLE campaign_organising_units
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    ou_id,
    ROW_NUMBER() OVER (
      PARTITION BY campaign_id
      ORDER BY name NULLS LAST, ou_id
    ) - 1 AS ord
  FROM campaign_organising_units
)
UPDATE campaign_organising_units AS c
SET display_order = ranked.ord
FROM ranked
WHERE c.ou_id = ranked.ou_id;

CREATE INDEX IF NOT EXISTS idx_cou_campaign_display_order
  ON campaign_organising_units (campaign_id, display_order);
