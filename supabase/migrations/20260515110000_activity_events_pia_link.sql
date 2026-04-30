-- ============================================================
-- Migration: activity_events — add pia_action_id FK
--
-- Links an activity_event occurrence to a specific pia_actions
-- row so participation can be aggregated per industrial action.
--
-- NOTE: activity_kind CHECK was already extended to include
-- 'industrial_action' in Wave 3. This migration only adds the
-- FK column and index.
-- ============================================================

ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS pia_action_id INT REFERENCES pia_actions(action_id);

CREATE INDEX IF NOT EXISTS idx_activity_events_pia_action
  ON activity_events(pia_action_id)
  WHERE pia_action_id IS NOT NULL;

COMMENT ON COLUMN activity_events.pia_action_id IS
  'Optional FK to pia_actions. Set when this event instance is a '
  'scheduled occurrence of a specific industrial action (e.g. a '
  'stop-work on a particular date). NULL for non-PIA events.';
