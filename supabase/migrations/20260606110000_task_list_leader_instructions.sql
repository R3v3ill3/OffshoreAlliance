-- ============================================================
-- Migration: Add leader_instructions to campaign_task_lists
--
-- Adds an optional free-text instructions field that staff can
-- populate during task list creation (Options step). The text
-- is shown at the top of the leader webform, directly below
-- the video header, so the leader receives context before they
-- begin rating workers.
-- ============================================================

ALTER TABLE campaign_task_lists
  ADD COLUMN IF NOT EXISTS leader_instructions TEXT;

COMMENT ON COLUMN campaign_task_lists.leader_instructions IS
  'Optional free-text instructions shown at the top of the leader '
  'webform below the video header. Written by staff during task '
  'list creation. Supports plain text; no HTML.';
