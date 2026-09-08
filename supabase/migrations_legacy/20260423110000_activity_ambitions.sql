-- ============================================================
-- Migration: activity_ambitions (M:N join)
--
-- Explicit many-to-many linkage between campaign_activities
-- (assessment templates) and plan_ambitions (campaign ambitions).
--
-- Rationale:
--   * One activity typically contributes to multiple ambitions
--     (e.g. a 1-on-1 conversation rates support for membership
--     AND MSD AND log-of-claims endorsement simultaneously).
--   * One ambition is usually measured via multiple activities
--     (e.g. MSD support via phone conversation, petition,
--     worker-to-worker assessment).
--
-- Design:
--   * Staff pick ambitions explicitly when creating/editing an
--     activity. The UX surfaces which activities feed which
--     ambitions and vice versa for oversight.
--   * Only worker_assessable ambitions may be linked (enforced
--     via BEFORE INSERT/UPDATE trigger).
--   * Deleting either side cascades the link; the underlying
--     activity ratings are NOT deleted (keep for audit).
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_ambitions (
  id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  plan_ambition_id INT NOT NULL REFERENCES plan_ambitions(ambition_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (activity_id, plan_ambition_id)
);

CREATE INDEX IF NOT EXISTS idx_aa_activity ON activity_ambitions(activity_id);
CREATE INDEX IF NOT EXISTS idx_aa_ambition ON activity_ambitions(plan_ambition_id);

COMMENT ON TABLE activity_ambitions IS
  'M:N link from campaign_activities to plan_ambitions. Only '
  'worker_assessable ambitions may be linked; campaign_setup '
  'ambitions are rejected by trigger.';

-- Trigger: block linking campaign_setup ambitions
CREATE OR REPLACE FUNCTION fn_reject_setup_ambition_activity_link()
RETURNS TRIGGER AS $$
DECLARE
  v_scope VARCHAR(20);
BEGIN
  SELECT ambition_scope INTO v_scope
  FROM plan_ambitions
  WHERE ambition_id = NEW.plan_ambition_id;

  IF v_scope IS DISTINCT FROM 'worker_assessable' THEN
    RAISE EXCEPTION
      'Cannot link plan_ambition % (scope=%) to an activity. '
      'Only worker_assessable ambitions can be linked to assessment activities.',
      NEW.plan_ambition_id, COALESCE(v_scope, 'null');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_setup_ambition_activity_link ON activity_ambitions;
CREATE TRIGGER trg_reject_setup_ambition_activity_link
  BEFORE INSERT OR UPDATE ON activity_ambitions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_setup_ambition_activity_link();

-- RLS: follow the same pattern as campaign_activities
ALTER TABLE activity_ambitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read activity_ambitions"
  ON activity_ambitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Can insert activity_ambitions"
  ON activity_ambitions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_ambitions.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Can update activity_ambitions"
  ON activity_ambitions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_ambitions.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_ambitions.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Can delete activity_ambitions"
  ON activity_ambitions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_ambitions.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

GRANT SELECT ON activity_ambitions TO authenticated;
