-- ============================================================
-- Migration: campaign_activity_ratings phase + event
--
-- Adds rating_phase ('expected' | 'actual') and event_id FK to
-- activity_events so the same (activity, worker) pair can carry
-- a pre-event soft rating and a post-event hard outcome without
-- overwriting each other.
--
-- Canonical flow for a stop-work meeting:
--   1. Staff create activity "Stop-work Mon 28 Apr"
--      + activity_events row with scheduled_at = 2026-04-28 07:00.
--   2. Leaders rate known workers 1..5 BEFORE the meeting
--      (rating_phase='expected', event_id=<event>). These
--      express intended support (1=will encourage others to
--      attend, 2=attending, 3=undecided, 4=not attending,
--      5=encouraging others not to attend).
--   3. After the meeting, attendance is recorded as
--      (rating_phase='actual', event_id=<event>, binary_value
--      one of 'attended','did_not_attend','abstain','unknown').
--
-- The previous UNIQUE (activity_id, worker_id) is replaced with
-- a 4-column UNIQUE NULLS NOT DISTINCT so existing "one-off"
-- ratings (event_id=NULL, phase='actual') remain unique per
-- (activity, worker) AND each event-bound rating has its own
-- row per phase.
-- ============================================================

-- 1. Add the columns (nullable at first for safe backfill)
ALTER TABLE campaign_activity_ratings
  ADD COLUMN IF NOT EXISTS rating_phase VARCHAR(10),
  ADD COLUMN IF NOT EXISTS event_id INT;

-- 2. Backfill existing rows to 'actual' phase
UPDATE campaign_activity_ratings
SET rating_phase = 'actual'
WHERE rating_phase IS NULL;

-- 3. Enforce NOT NULL + default + CHECK on rating_phase
ALTER TABLE campaign_activity_ratings
  ALTER COLUMN rating_phase SET NOT NULL,
  ALTER COLUMN rating_phase SET DEFAULT 'actual';

ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS car_rating_phase_chk;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT car_rating_phase_chk
  CHECK (rating_phase IN ('expected', 'actual'));

-- 4. FK on event_id
ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS car_event_id_fk;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT car_event_id_fk
  FOREIGN KEY (event_id) REFERENCES activity_events(event_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_car_event ON campaign_activity_ratings(event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_car_phase ON campaign_activity_ratings(rating_phase);

-- 5. Relax rating NOT NULL (attendance-only rows can carry
--    binary_value with no numeric rating) + require at least
--    one of rating or binary_value per row.
ALTER TABLE campaign_activity_ratings
  ALTER COLUMN rating DROP NOT NULL;

ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS car_rating_or_binary_chk;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT car_rating_or_binary_chk
  CHECK (rating IS NOT NULL OR binary_value IS NOT NULL);

-- 6. Swap uniqueness: drop 2-col, add 4-col NULLS NOT DISTINCT.
--    The default-named legacy constraint is
--    campaign_activity_ratings_activity_id_worker_id_key.
ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS campaign_activity_ratings_activity_id_worker_id_key;

ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS car_worker_phase_event_uq;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT car_worker_phase_event_uq
  UNIQUE NULLS NOT DISTINCT (activity_id, worker_id, rating_phase, event_id);

-- 7. Extend source CHECK to allow richer provenance values used
--    by Phase 3 capture paths and the Phase 4 auto-rate-on-
--    task-take flow. Keeps 'staff' and 'leader_form' for
--    backward compatibility.
ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS campaign_activity_ratings_source_check;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT campaign_activity_ratings_source_check
  CHECK (source IN (
    'staff',
    'leader_form',
    'call_outcome',
    'task_take',
    'sms',
    'email',
    'petition',
    'meeting'
  ));

COMMENT ON COLUMN campaign_activity_ratings.rating_phase IS
  'expected = pre-event / soft rating (intention). '
  'actual = post-event / hard outcome. Defaults to actual for '
  'activities not bound to a scheduled event.';

COMMENT ON COLUMN campaign_activity_ratings.event_id IS
  'Optional link to activity_events. NULL means the rating is '
  'against the activity in general, not a specific instance.';
