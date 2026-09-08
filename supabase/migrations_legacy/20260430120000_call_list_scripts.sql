-- ============================================================
-- Migration 20260430120000: Call List <-> Script many-to-many
--
-- Introduces call_list_scripts join so that:
--   - one call_script can power many call_lists (reuse a script
--     across multiple audience segments), AND
--   - one call_list can carry many call_scripts over time (wave
--     model: different stages of a campaign reuse the same list
--     with a different script per call session).
--
-- call_lists.script_id is retained as a convenience "current
-- wave" pointer and is kept in sync with the row in
-- call_list_scripts where is_current = TRUE via trigger.
--
-- Backfill: every existing call_lists row with a non-null
-- script_id gets a corresponding call_list_scripts row marked
-- is_current = TRUE and wave_label = 'Initial'.
-- ============================================================

-- -------------------------------------------------------
-- 1. call_list_scripts
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_list_scripts (
  list_id INTEGER NOT NULL REFERENCES call_lists(list_id) ON DELETE CASCADE,
  script_id INTEGER NOT NULL REFERENCES call_scripts(script_id) ON DELETE CASCADE,
  wave_label VARCHAR(200),
  is_current BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  linked_by UUID REFERENCES auth.users(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, script_id)
);

CREATE INDEX IF NOT EXISTS idx_cls_list ON call_list_scripts(list_id);
CREATE INDEX IF NOT EXISTS idx_cls_script ON call_list_scripts(script_id);

-- At most one current wave per list
CREATE UNIQUE INDEX IF NOT EXISTS uq_cls_current_per_list
  ON call_list_scripts(list_id)
  WHERE is_current = true;

-- -------------------------------------------------------
-- 2. Backfill from call_lists.script_id
-- -------------------------------------------------------
INSERT INTO call_list_scripts (list_id, script_id, wave_label, is_current, linked_by, linked_at)
SELECT cl.list_id, cl.script_id, 'Initial', true, cl.created_by, cl.created_at
FROM call_lists cl
WHERE cl.script_id IS NOT NULL
ON CONFLICT (list_id, script_id) DO NOTHING;

-- -------------------------------------------------------
-- 3. Sync trigger: keep call_lists.script_id in sync with the
--    row marked is_current = true in call_list_scripts.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_call_list_current_script()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_current THEN
      UPDATE call_lists
      SET script_id = NULL
      WHERE list_id = OLD.list_id
        AND script_id = OLD.script_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.is_current THEN
    -- Demote any other current rows for this list.
    UPDATE call_list_scripts
    SET is_current = false
    WHERE list_id = NEW.list_id
      AND script_id <> NEW.script_id
      AND is_current = true;

    UPDATE call_lists
    SET script_id = NEW.script_id
    WHERE list_id = NEW.list_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_current AND NOT NEW.is_current THEN
    -- Row demoted; clear the pointer only if it still referenced this script.
    UPDATE call_lists
    SET script_id = NULL
    WHERE list_id = NEW.list_id
      AND script_id = NEW.script_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cls_sync_current ON call_list_scripts;
CREATE TRIGGER trg_cls_sync_current
  AFTER INSERT OR UPDATE OR DELETE ON call_list_scripts
  FOR EACH ROW EXECUTE FUNCTION sync_call_list_current_script();

-- -------------------------------------------------------
-- 4. RLS
-- -------------------------------------------------------
ALTER TABLE call_list_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read call_list_scripts"
  ON call_list_scripts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Can insert call_list_scripts"
  ON call_list_scripts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_scripts.list_id
        AND (
          (cl.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );

CREATE POLICY "Can update call_list_scripts"
  ON call_list_scripts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_scripts.list_id
        AND (
          (cl.campaign_id IS NULL AND (cl.created_by = auth.uid() OR is_admin()))
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_scripts.list_id
        AND (
          (cl.campaign_id IS NULL AND (cl.created_by = auth.uid() OR is_admin()))
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );

CREATE POLICY "Can delete call_list_scripts"
  ON call_list_scripts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_lists cl
      WHERE cl.list_id = call_list_scripts.list_id
        AND (
          (cl.campaign_id IS NULL AND (cl.created_by = auth.uid() OR is_admin()))
          OR (cl.campaign_id IS NOT NULL AND can_write_to_campaign(cl.campaign_id))
        )
    )
  );

-- -------------------------------------------------------
-- 5. Grants
-- -------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON call_list_scripts TO authenticated;
