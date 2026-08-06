-- ============================================================
-- Migration: Action Network participation import
--
-- Supports the wall-chart "Import participation" wizard:
--   1. Link a campaign_activities assessment to the AN action it
--      tracks (form / survey / petition / event) for manual re-sync.
--   2. participation_import_batches — one row per import run
--      (CSV report upload or AN API sync) for audit + provenance.
--   3. campaign_activity_ratings.import_batch_id — which batch a
--      rating came from (nullable; manual ratings stay NULL).
--   4. Widen the ratings source CHECK with the two import channels.
--   5. record_assessment_event gains p_import_batch_id.
-- ============================================================

-- -----------------------------------------------------------
-- 1. AN action linkage on assessments
-- -----------------------------------------------------------
ALTER TABLE campaign_activities
  ADD COLUMN IF NOT EXISTS an_resource_type VARCHAR(20)
    CHECK (an_resource_type IN ('form', 'survey', 'petition', 'event')),
  ADD COLUMN IF NOT EXISTS an_resource_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS an_browser_url TEXT,
  ADD COLUMN IF NOT EXISTS an_last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaign_activities_an_resource
  ON campaign_activities (an_resource_type, an_resource_id)
  WHERE an_resource_id IS NOT NULL;

COMMENT ON COLUMN campaign_activities.an_resource_id IS
  'Action Network action id this assessment tracks (uuid from the AN API). '
  'Set by the participation import wizard; enables one-click re-sync.';

-- -----------------------------------------------------------
-- 2. Import batch audit table
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS participation_import_batches (
  batch_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  activity_id INT NOT NULL REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  source_kind VARCHAR(20) NOT NULL
    CHECK (source_kind IN ('an_api', 'an_report_csv')),
  an_resource_type VARCHAR(20),
  an_resource_id VARCHAR(100),
  file_name VARCHAR(300),
  -- Column map, value→rating map and options as chosen in the wizard,
  -- kept for audit and to pre-fill repeat imports.
  mapping JSONB,
  rows_total INT NOT NULL DEFAULT 0,
  rows_matched INT NOT NULL DEFAULT 0,
  rows_created INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  workers_created INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pib_campaign ON participation_import_batches (campaign_id);
CREATE INDEX IF NOT EXISTS idx_pib_activity ON participation_import_batches (activity_id);

ALTER TABLE participation_import_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'participation_import_batches'
  ) THEN
    CREATE POLICY "Authenticated users can read participation_import_batches"
      ON participation_import_batches FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Admin/User can insert participation_import_batches"
      ON participation_import_batches FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN ('admin', 'user'));
    CREATE POLICY "Admin/User can update participation_import_batches"
      ON participation_import_batches FOR UPDATE TO authenticated
      USING (get_user_role() IN ('admin', 'user'))
      WITH CHECK (get_user_role() IN ('admin', 'user'));
    CREATE POLICY "Admin can delete participation_import_batches"
      ON participation_import_batches FOR DELETE TO authenticated
      USING (get_user_role() = 'admin');
  END IF;
END $$;

-- -----------------------------------------------------------
-- 3. Batch provenance on ratings
-- -----------------------------------------------------------
ALTER TABLE campaign_activity_ratings
  ADD COLUMN IF NOT EXISTS import_batch_id INT
    REFERENCES participation_import_batches(batch_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_car_import_batch
  ON campaign_activity_ratings (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- -----------------------------------------------------------
-- 4. Widen source CHECK with the AN import channels
-- -----------------------------------------------------------
ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS campaign_activity_ratings_source_check;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT campaign_activity_ratings_source_check
  CHECK (source IN (
    -- Legacy (kept for backward compat; new rows should use phone_call_live)
    'call_outcome',
    -- Phone-specific channels
    'phone_call_live',
    'phone_call_share_link',
    -- Other channels
    'door_knock',
    'task_assignment',
    'task_completion',
    -- Pre-existing non-phone sources
    'staff',
    'leader_form',
    'task_take',
    'sms',
    'email',
    'petition',
    'meeting',
    -- Action Network participation import (this migration)
    'an_sync',            -- pulled from the AN API (participation sync)
    'an_report_import'    -- uploaded AN report CSV with mapped answers
  ));

-- -----------------------------------------------------------
-- 5. record_assessment_event gains p_import_batch_id
--    Drop the old 9-arg signature first: keeping both would make
--    9-arg calls ambiguous once the 10-arg version (with default)
--    exists. plpgsql triggers resolve the name at call time, so
--    existing trigger functions keep working unchanged.
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS record_assessment_event(
  INT, INT, INT, VARCHAR, VARCHAR, INT, VARCHAR, TEXT, UUID
);

CREATE OR REPLACE FUNCTION record_assessment_event(
  p_activity_id INT,
  p_worker_id INT,
  p_rating INT DEFAULT NULL,
  p_binary_value VARCHAR DEFAULT NULL,
  p_rating_phase VARCHAR DEFAULT 'actual',
  p_event_id INT DEFAULT NULL,
  p_source VARCHAR DEFAULT 'staff',
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_import_batch_id INT DEFAULT NULL
) RETURNS INT AS $$
DECLARE
  v_rating_id INT;
BEGIN
  IF p_rating IS NULL AND p_binary_value IS NULL THEN
    RAISE EXCEPTION
      'record_assessment_event: at least one of p_rating or p_binary_value must be non-null';
  END IF;

  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION
      'record_assessment_event: p_rating must be 1..5 (got %)', p_rating;
  END IF;

  IF p_rating_phase NOT IN ('expected', 'actual') THEN
    RAISE EXCEPTION
      'record_assessment_event: p_rating_phase must be expected or actual (got %)', p_rating_phase;
  END IF;

  INSERT INTO campaign_activity_ratings (
    activity_id, worker_id, rating, binary_value, notes,
    source, rated_at, rated_by_user_id, rating_phase, event_id,
    import_batch_id
  )
  VALUES (
    p_activity_id, p_worker_id, p_rating, p_binary_value, p_notes,
    p_source, now(), p_actor_id, p_rating_phase, p_event_id,
    p_import_batch_id
  )
  ON CONFLICT (activity_id, worker_id, rating_phase, event_id) DO UPDATE SET
    rating = COALESCE(EXCLUDED.rating, campaign_activity_ratings.rating),
    binary_value = COALESCE(EXCLUDED.binary_value, campaign_activity_ratings.binary_value),
    notes = COALESCE(EXCLUDED.notes, campaign_activity_ratings.notes),
    source = EXCLUDED.source,
    rated_at = EXCLUDED.rated_at,
    rated_by_user_id = COALESCE(EXCLUDED.rated_by_user_id, campaign_activity_ratings.rated_by_user_id),
    import_batch_id = COALESCE(EXCLUDED.import_batch_id, campaign_activity_ratings.import_batch_id)
  RETURNING rating_id INTO v_rating_id;

  RETURN v_rating_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_assessment_event TO authenticated;

COMMENT ON FUNCTION record_assessment_event IS
  'Single upsert entry point for campaign_activity_ratings. Validates '
  'rating range and phase; returns the rating_id. Other sources (SMS, '
  'email, petition, meeting, staff UI, AN import) should funnel through this.';
