-- ============================================================
-- Migration 20260508100000: SOC Wizard
--
-- Adds tables for the Structured Organising Conversation (SOC) wizard:
--   - soc_sessions          : one row per wizard run (standalone or
--                             campaign-linked)
--   - soc_stage_content     : the locked content for each of the 8 SOC
--                             stages, keyed (session_id, stage_number,
--                             hope_frame). Stage 5 (Hope) may have up
--                             to 3 rows (one per Hope frame).
--   - soc_chat_turns        : the multi-turn coaching transcript
--                             between the organiser and the AI coach,
--                             scoped to a stage (and Hope frame for
--                             stage 5).
--   - soc_derived_artifacts : trace SOC exports back to the source SOC.
--                             For email/sms/phone_script kinds, points
--                             at a campaign_comms_drafts row. For
--                             snippet kind, holds the body inline.
--
-- Also seeds capacity_options rows for "Structured Organising
-- Conversation" across stages 2-5 so the new capacity surfaces in the
-- planner's CapacitiesPanel.
--
-- RLS pattern mirrors 20260415100000_phone_wizard_standalone.sql:
--   - INSERT: standalone (campaign_id IS NULL) → auth.uid() IS NOT NULL
--             campaign-linked → can_write_to_campaign(campaign_id)
--   - UPDATE: standalone → created_by = auth.uid() OR is_admin()
--             campaign-linked → can_write_to_campaign(campaign_id)
--   - SELECT: authenticated users (mirrors comms_template_library), with
--             standalone rows visible to creator + admins only and
--             campaign-linked rows visible to anyone with read access.
--   - Children (soc_stage_content / soc_chat_turns /
--     soc_derived_artifacts) derive write access from the parent
--     soc_sessions row, same way call_script_sections derives from
--     call_scripts.
-- ============================================================


-- -------------------------------------------------------
-- 1. soc_sessions
-- -------------------------------------------------------
CREATE TABLE soc_sessions (
    session_id           BIGSERIAL PRIMARY KEY,
    campaign_id          INTEGER REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
    plan_id              INTEGER REFERENCES campaign_stage_plans(plan_id) ON DELETE SET NULL,
    stage_number         INTEGER CHECK (stage_number BETWEEN 1 AND 6),
    capacity_id          INTEGER REFERENCES plan_capacities(capacity_id) ON DELETE SET NULL,
    title                TEXT NOT NULL,
    target_populations   JSONB NOT NULL DEFAULT '[]'::jsonb,
    context_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
    custom_situation     TEXT,
    status               TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','complete','exported','archived')),
    created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_soc_sessions_campaign ON soc_sessions(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_soc_sessions_creator  ON soc_sessions(created_by);
CREATE INDEX idx_soc_sessions_capacity ON soc_sessions(capacity_id) WHERE capacity_id IS NOT NULL;

CREATE TRIGGER trg_soc_sessions_updated_at
    BEFORE UPDATE ON soc_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE soc_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select soc_sessions"
  ON soc_sessions FOR SELECT TO authenticated
  USING (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL)
  );

CREATE POLICY "Can insert soc_sessions"
  ON soc_sessions FOR INSERT TO authenticated
  WITH CHECK (
    (campaign_id IS NULL AND auth.uid() IS NOT NULL)
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

CREATE POLICY "Can update soc_sessions"
  ON soc_sessions FOR UPDATE TO authenticated
  USING (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  )
  WITH CHECK (
    (campaign_id IS NULL AND (created_by = auth.uid() OR is_admin()))
    OR (campaign_id IS NOT NULL AND can_write_to_campaign(campaign_id))
  );

CREATE POLICY "Admins can delete soc_sessions"
  ON soc_sessions FOR DELETE TO authenticated
  USING (is_admin() OR (campaign_id IS NULL AND created_by = auth.uid()));


-- -------------------------------------------------------
-- 2. soc_stage_content
-- -------------------------------------------------------
CREATE TABLE soc_stage_content (
    content_id            BIGSERIAL PRIMARY KEY,
    session_id            BIGINT NOT NULL REFERENCES soc_sessions(session_id) ON DELETE CASCADE,
    stage_number          SMALLINT NOT NULL CHECK (stage_number BETWEEN 1 AND 8),
    stage_name            TEXT NOT NULL,
    locked_content        TEXT NOT NULL,
    organiser_notes       TEXT,
    populations_targeted  JSONB NOT NULL DEFAULT '[]'::jsonb,
    hope_frame            TEXT CHECK (hope_frame IN ('opportunity','plan','dont_take_lolly')),
    locked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- NULLs are distinct in Postgres UNIQUE — desired: stages 1-4 and
    -- 6-8 produce one row each (hope_frame IS NULL), stage 5 produces
    -- up to 3 rows (one per hope_frame).
    CONSTRAINT soc_stage_content_unique UNIQUE (session_id, stage_number, hope_frame),
    -- hope_frame is only valid on stage 5
    CONSTRAINT soc_stage_content_hope_frame_only_stage_5 CHECK (
        (stage_number = 5 AND hope_frame IS NOT NULL)
        OR (stage_number <> 5 AND hope_frame IS NULL)
    )
);

CREATE INDEX idx_soc_stage_content_session ON soc_stage_content(session_id);

ALTER TABLE soc_stage_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select soc_stage_content"
  ON soc_stage_content FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_stage_content.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL)
        )
    )
  );

CREATE POLICY "Can insert soc_stage_content"
  ON soc_stage_content FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_stage_content.session_id
        AND (
          (s.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );

CREATE POLICY "Can update soc_stage_content"
  ON soc_stage_content FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_stage_content.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_stage_content.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );

CREATE POLICY "Can delete soc_stage_content"
  ON soc_stage_content FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_stage_content.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );


-- -------------------------------------------------------
-- 3. soc_chat_turns
-- -------------------------------------------------------
CREATE TABLE soc_chat_turns (
    turn_id        BIGSERIAL PRIMARY KEY,
    session_id     BIGINT NOT NULL REFERENCES soc_sessions(session_id) ON DELETE CASCADE,
    stage_number   SMALLINT NOT NULL CHECK (stage_number BETWEEN 1 AND 8),
    hope_frame     TEXT CHECK (hope_frame IN ('opportunity','plan','dont_take_lolly')),
    turn_index     INTEGER NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content        TEXT NOT NULL,
    ai_metadata    JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT soc_chat_turns_unique UNIQUE (session_id, stage_number, hope_frame, turn_index),
    CONSTRAINT soc_chat_turns_hope_frame_only_stage_5 CHECK (
        (stage_number = 5 AND hope_frame IS NOT NULL)
        OR (stage_number <> 5 AND hope_frame IS NULL)
    )
);

CREATE INDEX idx_soc_chat_turns_session_stage ON soc_chat_turns(session_id, stage_number);

ALTER TABLE soc_chat_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select soc_chat_turns"
  ON soc_chat_turns FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_chat_turns.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL)
        )
    )
  );

CREATE POLICY "Can insert soc_chat_turns"
  ON soc_chat_turns FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_chat_turns.session_id
        AND (
          (s.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );

-- Chat turns are generally append-only; we still allow update+delete
-- so a regenerate-stage flow can clean them up.
CREATE POLICY "Can update soc_chat_turns"
  ON soc_chat_turns FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_chat_turns.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_chat_turns.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );

CREATE POLICY "Can delete soc_chat_turns"
  ON soc_chat_turns FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_chat_turns.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );


-- -------------------------------------------------------
-- 4. soc_derived_artifacts
-- -------------------------------------------------------
CREATE TABLE soc_derived_artifacts (
    artifact_id    BIGSERIAL PRIMARY KEY,
    session_id     BIGINT NOT NULL REFERENCES soc_sessions(session_id) ON DELETE CASCADE,
    stage_number   SMALLINT CHECK (stage_number IS NULL OR stage_number BETWEEN 1 AND 8),
    hope_frame     TEXT CHECK (hope_frame IN ('opportunity','plan','dont_take_lolly')),
    artifact_kind  TEXT NOT NULL CHECK (artifact_kind IN ('email','sms','phone_script','snippet')),
    draft_id       INTEGER REFERENCES campaign_comms_drafts(draft_id) ON DELETE SET NULL,
    inline_body    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- snippet kind keeps body inline; comms kinds point at a draft row
    CONSTRAINT soc_derived_artifact_body_xor CHECK (
        (artifact_kind = 'snippet' AND inline_body IS NOT NULL)
        OR (artifact_kind <> 'snippet' AND draft_id IS NOT NULL)
        -- allow a transient state where draft_id has been NULLed by a
        -- subsequent draft delete; the row remains for trace purposes
        OR (artifact_kind <> 'snippet' AND draft_id IS NULL)
    )
);

CREATE INDEX idx_soc_derived_artifacts_session ON soc_derived_artifacts(session_id);
CREATE INDEX idx_soc_derived_artifacts_draft   ON soc_derived_artifacts(draft_id) WHERE draft_id IS NOT NULL;

ALTER TABLE soc_derived_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select soc_derived_artifacts"
  ON soc_derived_artifacts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_derived_artifacts.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL)
        )
    )
  );

CREATE POLICY "Can insert soc_derived_artifacts"
  ON soc_derived_artifacts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_derived_artifacts.session_id
        AND (
          (s.campaign_id IS NULL AND auth.uid() IS NOT NULL)
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );

CREATE POLICY "Can delete soc_derived_artifacts"
  ON soc_derived_artifacts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soc_sessions s
      WHERE s.session_id = soc_derived_artifacts.session_id
        AND (
          (s.campaign_id IS NULL AND (s.created_by = auth.uid() OR is_admin()))
          OR (s.campaign_id IS NOT NULL AND can_write_to_campaign(s.campaign_id))
        )
    )
  );


-- -------------------------------------------------------
-- 5. Capacity option seeds
--    Seed "Structured Organising Conversation" as a capacity option
--    available in stages 2-5 (where SOC work is most relevant). Each
--    stage gets its own row, mirroring the existing per-stage capacity
--    options pattern.
-- -------------------------------------------------------
INSERT INTO capacity_options (stage_number, category, option_text, description, is_system_default, is_active)
SELECT s, 'organising_conversation', 'Structured Organising Conversation',
       'Build a coach-guided 8-stage SOC for this stage. Use the SOC wizard to draft and refine each stage with AI coaching, then export to phone, email, or SMS.',
       TRUE, TRUE
FROM generate_series(2, 5) AS s
WHERE NOT EXISTS (
    SELECT 1 FROM capacity_options
    WHERE stage_number = s
      AND option_text = 'Structured Organising Conversation'
);
