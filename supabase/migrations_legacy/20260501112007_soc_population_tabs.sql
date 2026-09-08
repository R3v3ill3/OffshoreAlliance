-- Add population_index to soc_stage_content and soc_chat_turns so each SOC stage
-- can have separate coaching sessions and locked drafts per worker population.
-- Stage 5 (Hope) keeps its existing hope_frame scoping and never uses population_index.
-- Stages 1-4, 6-8 use population_index (0-based into soc_sessions.target_populations)
-- when populations are defined; NULL when no populations are configured.

-- ── soc_stage_content ─────────────────────────────────────────────────────────

ALTER TABLE soc_stage_content
  ADD COLUMN population_index SMALLINT
    CHECK (population_index IS NULL OR population_index >= 0);

ALTER TABLE soc_stage_content
  DROP CONSTRAINT soc_stage_content_unique,
  DROP CONSTRAINT soc_stage_content_hope_frame_only_stage_5;

ALTER TABLE soc_stage_content
  ADD CONSTRAINT soc_stage_content_unique
    UNIQUE NULLS NOT DISTINCT (session_id, stage_number, hope_frame, population_index);

ALTER TABLE soc_stage_content
  ADD CONSTRAINT soc_stage_content_frame_check CHECK (
    (stage_number = 5 AND hope_frame IS NOT NULL AND population_index IS NULL)
    OR (stage_number <> 5 AND hope_frame IS NULL)
  );

-- ── soc_chat_turns ────────────────────────────────────────────────────────────

ALTER TABLE soc_chat_turns
  ADD COLUMN population_index SMALLINT
    CHECK (population_index IS NULL OR population_index >= 0);

ALTER TABLE soc_chat_turns
  DROP CONSTRAINT soc_chat_turns_unique,
  DROP CONSTRAINT soc_chat_turns_hope_frame_only_stage_5;

ALTER TABLE soc_chat_turns
  ADD CONSTRAINT soc_chat_turns_unique
    UNIQUE NULLS NOT DISTINCT (session_id, stage_number, hope_frame, population_index, turn_index);

ALTER TABLE soc_chat_turns
  ADD CONSTRAINT soc_chat_turns_frame_check CHECK (
    (stage_number = 5 AND hope_frame IS NOT NULL AND population_index IS NULL)
    OR (stage_number <> 5 AND hope_frame IS NULL)
  );
