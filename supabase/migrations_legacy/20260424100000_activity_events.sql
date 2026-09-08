-- ============================================================
-- Migration: activity_events
--
-- Represents a scheduled instance of an assessable activity where
-- workers can have an "expected" (pre-event, soft 1-5) rating and
-- an "actual" (post-event, hard) outcome.
--
-- Canonical examples:
--   * stop-work meeting (workers rated 1-5 beforehand for intended
--     support, then attended / did_not_attend / DNP after)
--   * protected-action ballot (pledged yes before, actual vote after)
--   * rally / visibility action (intended to attend, actually attended)
--
-- One campaign_activities row can have many events (e.g. a single
-- "Stop-work meeting" activity, many dated instances). Ratings in
-- campaign_activity_ratings reference event_id when tied to a
-- specific occurrence; NULL event_id means the rating is against
-- the activity in general (e.g. MSD support as assessed via 1:1).
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_events (
  event_id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  name VARCHAR(300) NOT NULL,
  event_kind VARCHAR(30) NOT NULL DEFAULT 'meeting'
    CHECK (event_kind IN ('meeting', 'vote', 'action', 'other')),
  scheduled_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  location TEXT,
  outcome JSONB,
  notes TEXT,
  is_concluded BOOLEAN NOT NULL DEFAULT FALSE,
  concluded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_activity_events_activity
  ON activity_events(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_scheduled
  ON activity_events(scheduled_at)
  WHERE scheduled_at IS NOT NULL;

COMMENT ON TABLE activity_events IS
  'Scheduled instances of an activity (meetings, votes, actions). '
  'Ratings in campaign_activity_ratings can reference event_id to '
  'distinguish expected (pre-event) from actual (post-event).';

-- RLS follows campaign_activities pattern via the parent activity's campaign
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read activity_events"
  ON activity_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Can insert activity_events"
  ON activity_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_events.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Can update activity_events"
  ON activity_events FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_events.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_events.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

CREATE POLICY "Can delete activity_events"
  ON activity_events FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_activities a
      WHERE a.activity_id = activity_events.activity_id
        AND (can_write_to_campaign(a.campaign_id) OR is_admin())
    )
  );

GRANT SELECT ON activity_events TO authenticated;
