-- ============================================================
-- Migration: pia_actions + pia_seed_packs
--
-- pia_actions: records a specific industrial action taken (or
-- planned) within a campaign, optionally linked to a PABO
-- application and ballot question.
--
-- pia_seed_packs: lookup table of named escalation-ladder
-- templates that can be seeded into a campaign.
-- ============================================================

-- 1. PIA actions table
CREATE TABLE pia_actions (
  action_id       SERIAL PRIMARY KEY,
  campaign_id     INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  pabo_id         INT REFERENCES pabo_applications(pabo_id),
  pabo_question_id INT REFERENCES pabo_ballot_questions(question_id),
  action_type     TEXT NOT NULL,
  escalation_level INT NOT NULL DEFAULT 1,
  notice_given_at  TIMESTAMPTZ,
  action_starts_at TIMESTAMPTZ,
  action_ends_at   TIMESTAMPTZ,
  target_population_definition JSONB,
  participation_target_count INT,
  is_concluded    BOOLEAN NOT NULL DEFAULT false,
  concluded_at    TIMESTAMPTZ,
  outcome_summary JSONB,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pia_actions_campaign
  ON pia_actions(campaign_id);

CREATE INDEX IF NOT EXISTS idx_pia_actions_pabo
  ON pia_actions(pabo_id)
  WHERE pabo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pia_actions_escalation
  ON pia_actions(campaign_id, escalation_level);

CREATE OR REPLACE TRIGGER trg_pia_actions_updated_at
  BEFORE UPDATE ON pia_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE pia_actions IS
  'Records a specific industrial action (planned or concluded) within '
  'a campaign. Linked optionally to a PABO application and ballot question. '
  'escalation_level orders actions on the escalating ladder.';

-- 2. PIA seed packs lookup table
CREATE TABLE pia_seed_packs (
  pack_key    TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  action_types TEXT[] NOT NULL
);

COMMENT ON TABLE pia_seed_packs IS
  'Named escalation-ladder seed packs. Each pack_key identifies a '
  'pre-defined set of action_types (in escalation order) that can be '
  'seeded into a campaign via seed_pia_pack_* functions.';

-- 3. RLS — pia_actions
ALTER TABLE pia_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read pia_actions" ON pia_actions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert pia_actions" ON pia_actions FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update pia_actions" ON pia_actions FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete pia_actions" ON pia_actions FOR DELETE TO authenticated USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 4. RLS — pia_seed_packs
ALTER TABLE pia_seed_packs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read pia_seed_packs" ON pia_seed_packs FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert pia_seed_packs" ON pia_seed_packs FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update pia_seed_packs" ON pia_seed_packs FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete pia_seed_packs" ON pia_seed_packs FOR DELETE TO authenticated USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

GRANT SELECT ON pia_actions TO authenticated;
GRANT SELECT ON pia_seed_packs TO authenticated;
