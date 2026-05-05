-- ============================================================
-- Migration: Leader tasking enhanced — Phase 1 schema foundation
--
-- Adds the schema underpinnings for the enhanced leader-tasking
-- workflow:
--   1. Assessment provenance on campaign_activities
--      (hard / self_assessed / organiser_assessed / activist_assessed)
--   2. Workflow flexibility on campaign_task_lists
--      (default 'draft', membership-ask flag, draft notes,
--       partial constraint enforcing complete-on-active)
--   3. Password + audit fields on campaign_leader_tokens
--      (existing tokens are revoked because they predate the
--       password requirement)
--   4. New campaign_leader_form_events audit table
--   5. Review queue metadata on campaign_prospective_workers
--   6. Per-rating provenance override on campaign_activity_ratings
--   7. Re-introduces oa_leader_role on campaign_worker_membership
--      (was removed in 20260415100000_leadership_harmonisation;
--      Phase 1 brings it back as a campaign-scoped marker so the
--      leader-form auto-promote behaviour can be campaign-scoped
--      without globally reclassifying a worker's member_role_type_id.
--      See the trigger comment for semantics.)
--   8. Auto-side-effect trigger on campaign_task_list_items —
--      mirrors 20260426100000_workplan_task_worker_autorating.sql
--      but does rating + membership + leader-link in one function.
--
-- The plan referenced VOTE_SUPPORTER_OPTIONS adding 'unsure'.
-- Inspection shows binary_value is unconstrained at the DB level
-- (the only enumeration is in TypeScript). This migration leaves
-- the constants change to a later phase — no DB CHECK to update.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. campaign_activities — assessment provenance
-- ─────────────────────────────────────────────────────────────
ALTER TABLE campaign_activities
  ADD COLUMN IF NOT EXISTS assessment_type VARCHAR(20) NOT NULL DEFAULT 'organiser_assessed';

ALTER TABLE campaign_activities
  DROP CONSTRAINT IF EXISTS campaign_activities_assessment_type_chk;

ALTER TABLE campaign_activities
  ADD CONSTRAINT campaign_activities_assessment_type_chk
  CHECK (assessment_type IN ('hard','self_assessed','organiser_assessed','activist_assessed'));

COMMENT ON COLUMN campaign_activities.assessment_type IS
  'Default provenance for ratings recorded against this activity. '
  'hard = directly observed outcome (signed petition, attended meeting); '
  'self_assessed = the worker rated themselves; '
  'organiser_assessed = a staff organiser rated the worker (default); '
  'activist_assessed = an activist or delegate rated the worker via the '
  'leader webform. Individual ratings can override via '
  'campaign_activity_ratings.assessment_type_override.';

-- ─────────────────────────────────────────────────────────────
-- 2. campaign_task_lists — workflow flexibility & membership ask
-- ─────────────────────────────────────────────────────────────
ALTER TABLE campaign_task_lists
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE campaign_task_lists
  ADD COLUMN IF NOT EXISTS include_membership_ask BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE campaign_task_lists
  ADD COLUMN IF NOT EXISTS draft_notes TEXT;

-- Existing status CHECK already allows ('draft','active','completed') —
-- recreated explicitly to be authoritative under the new default.
ALTER TABLE campaign_task_lists
  DROP CONSTRAINT IF EXISTS campaign_task_lists_status_check;

ALTER TABLE campaign_task_lists
  ADD CONSTRAINT campaign_task_lists_status_check
  CHECK (status IN ('draft','active','completed'));

-- Drop the legacy unconditional check that required a leader on every row;
-- replaced by the conditional chk_active_task_list_complete below.
ALTER TABLE campaign_task_lists
  DROP CONSTRAINT IF EXISTS campaign_task_lists_check;

ALTER TABLE campaign_task_lists
  DROP CONSTRAINT IF EXISTS chk_active_task_list_complete;

ALTER TABLE campaign_task_lists
  ADD CONSTRAINT chk_active_task_list_complete
  CHECK (
    status = 'draft'
    OR (
      activity_id IS NOT NULL
      AND (leader_worker_id IS NOT NULL OR leader_organiser_id IS NOT NULL)
    )
  );

COMMENT ON COLUMN campaign_task_lists.include_membership_ask IS
  'When TRUE the leader webform surfaces an inline membership-conversion '
  'column for each worker on the list (non_member -> member_pending, etc).';

COMMENT ON COLUMN campaign_task_lists.draft_notes IS
  'Free-form scratchpad notes captured while the task list is in '
  'status=''draft''. Cleared/archived once the list is activated.';

COMMENT ON CONSTRAINT chk_active_task_list_complete ON campaign_task_lists IS
  'Drafts may have NULL activity_id and NULL leader fields. As soon as '
  'status moves out of ''draft'' the row must have an activity AND at '
  'least one leader (worker or organiser).';

-- ─────────────────────────────────────────────────────────────
-- 3. campaign_leader_tokens — password + audit
-- ─────────────────────────────────────────────────────────────
ALTER TABLE campaign_leader_tokens
  ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE campaign_leader_tokens
  ADD COLUMN IF NOT EXISTS password_algo VARCHAR(20) NOT NULL DEFAULT 'argon2id';

ALTER TABLE campaign_leader_tokens
  ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;

ALTER TABLE campaign_leader_tokens
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE campaign_leader_tokens
  ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES auth.users(id);

-- Any existing tokens predate the password requirement and have an
-- empty password_hash. Auto-revoke them so a misuse window cannot open.
UPDATE campaign_leader_tokens
SET revoked_at = COALESCE(revoked_at, now())
WHERE password_hash = '';

-- Now drop the empty-string default so future inserts must supply a hash.
ALTER TABLE campaign_leader_tokens
  ALTER COLUMN password_hash DROP DEFAULT;

COMMENT ON COLUMN campaign_leader_tokens.password_hash IS
  'argon2id (or bcrypt) hash of the issuer-supplied password. '
  'Pre-existing rows were created without passwords; they were '
  'auto-revoked by the Phase 1 migration and must be re-issued.';
COMMENT ON COLUMN campaign_leader_tokens.password_algo IS
  'Algorithm used to compute password_hash. Defaults to argon2id.';
COMMENT ON COLUMN campaign_leader_tokens.failed_attempts IS
  'Running count of failed password attempts. Reset on successful auth. '
  'Triggers a 15-minute lockout (locked_until) at the API layer when >= 5.';
COMMENT ON COLUMN campaign_leader_tokens.locked_until IS
  'Timestamp until which password attempts are rejected without checking '
  'the hash. Set by the API layer after repeated failures.';
COMMENT ON COLUMN campaign_leader_tokens.issued_by IS
  'auth.users.id of the staff member who issued the token. Used for '
  'progress dashboards and revocation provenance.';

-- ─────────────────────────────────────────────────────────────
-- 4. campaign_leader_form_events — audit log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_leader_form_events (
  event_id    BIGSERIAL PRIMARY KEY,
  token_id    INT NOT NULL REFERENCES campaign_leader_tokens(token_id) ON DELETE CASCADE,
  event_type  VARCHAR(40) NOT NULL,
  worker_id   INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  payload     JSONB,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clfe_token ON campaign_leader_form_events(token_id);
CREATE INDEX IF NOT EXISTS idx_clfe_event_type ON campaign_leader_form_events(event_type);
CREATE INDEX IF NOT EXISTS idx_clfe_created_at ON campaign_leader_form_events(created_at DESC);

ALTER TABLE campaign_leader_form_events ENABLE ROW LEVEL SECURITY;

-- SELECT for authenticated users (admin|user|read-only); INSERT only via
-- the service-role admin client used by /api/campaign-leader/[token]/* —
-- intentionally no INSERT policy for the authenticated role.
DO $$
BEGIN
  BEGIN
    CREATE POLICY "Authenticated users can read campaign_leader_form_events"
      ON campaign_leader_form_events FOR SELECT TO authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin can delete campaign_leader_form_events"
      ON campaign_leader_form_events FOR DELETE TO authenticated
      USING (get_user_role() = 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE campaign_leader_form_events IS
  'Append-only audit log of significant events on the leader webform: '
  'opened / auth_success / auth_fail / rating_saved / worker_edited / '
  'membership_changed / prospective_added / existing_added. Powers the '
  'originating staff member''s progress dashboard (Phase 6).';
COMMENT ON COLUMN campaign_leader_form_events.event_type IS
  'Discrete event categorisation. Recommended values: opened, auth_success, '
  'auth_fail, rating_saved, worker_edited, membership_changed, '
  'prospective_added, existing_added.';
COMMENT ON COLUMN campaign_leader_form_events.payload IS
  'Optional JSON payload carrying diff or counts (e.g. {"changed":["phone"]} '
  'or {"new_rating":1}). Treat as audit-only — do not key UI off this shape.';
COMMENT ON COLUMN campaign_leader_form_events.ip_hash IS
  'SHA-256 hash of the request IP. Used for rate-limit / abuse triage; '
  'plain IPs are not stored.';

-- ─────────────────────────────────────────────────────────────
-- 5. campaign_prospective_workers — review queue metadata
-- ─────────────────────────────────────────────────────────────
ALTER TABLE campaign_prospective_workers
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE campaign_prospective_workers
  DROP CONSTRAINT IF EXISTS campaign_prospective_workers_review_status_chk;

ALTER TABLE campaign_prospective_workers
  ADD CONSTRAINT campaign_prospective_workers_review_status_chk
  CHECK (review_status IN ('pending','approved','rejected','merged'));

ALTER TABLE campaign_prospective_workers
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

ALTER TABLE campaign_prospective_workers
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE campaign_prospective_workers
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE campaign_prospective_workers
  ADD COLUMN IF NOT EXISTS source_token_id INT
    REFERENCES campaign_leader_tokens(token_id) ON DELETE SET NULL;

ALTER TABLE campaign_prospective_workers
  ADD COLUMN IF NOT EXISTS source_leader_worker_id INT
    REFERENCES workers(worker_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cpw_review_status
  ON campaign_prospective_workers(review_status)
  WHERE review_status = 'pending';

COMMENT ON COLUMN campaign_prospective_workers.review_status IS
  'Lifecycle state for the leader-form review queue. pending = awaiting '
  'staff review; approved = promoted to a real workers row; merged = '
  'collapsed onto an existing worker (merged_worker_id); rejected = '
  'staff dismissed (with optional review_notes).';
COMMENT ON COLUMN campaign_prospective_workers.source_token_id IS
  'Token through which the leader added this prospective worker. '
  'Lets the review UI show which leader/list the suggestion came from.';
COMMENT ON COLUMN campaign_prospective_workers.source_leader_worker_id IS
  'Worker-id of the leader who added the prospective entry, captured at '
  'the moment of submission so the link survives token revocation.';

-- ─────────────────────────────────────────────────────────────
-- 6. campaign_activity_ratings — per-rating provenance override
-- ─────────────────────────────────────────────────────────────
ALTER TABLE campaign_activity_ratings
  ADD COLUMN IF NOT EXISTS assessment_type_override VARCHAR(20);

ALTER TABLE campaign_activity_ratings
  DROP CONSTRAINT IF EXISTS car_assessment_type_override_chk;

ALTER TABLE campaign_activity_ratings
  ADD CONSTRAINT car_assessment_type_override_chk
  CHECK (
    assessment_type_override IS NULL
    OR assessment_type_override IN ('hard','self_assessed','organiser_assessed','activist_assessed')
  );

COMMENT ON COLUMN campaign_activity_ratings.assessment_type_override IS
  'Per-rating override of the activity-level assessment_type. The leader '
  'webform always sets this to ''activist_assessed'' regardless of the '
  'parent activity''s default. Reporting joins prefer override IS NOT NULL '
  'and fall back to campaign_activities.assessment_type otherwise.';

-- ─────────────────────────────────────────────────────────────
-- 7. campaign_worker_membership — re-introduce campaign-scoped role
-- ─────────────────────────────────────────────────────────────
-- This column was dropped in 20260415100000_leadership_harmonisation
-- when the three role systems were collapsed into workers.member_role_type_id.
-- Phase 1 reinstates it as a campaign-scoped role marker so the auto-
-- promote-on-task-list-item behaviour can record activist status without
-- globally elevating a worker's role across all campaigns. The legal
-- values match the historical column definition.
ALTER TABLE campaign_worker_membership
  ADD COLUMN IF NOT EXISTS oa_leader_role VARCHAR(20);

ALTER TABLE campaign_worker_membership
  DROP CONSTRAINT IF EXISTS campaign_worker_membership_oa_leader_role_chk;

ALTER TABLE campaign_worker_membership
  ADD CONSTRAINT campaign_worker_membership_oa_leader_role_chk
  CHECK (oa_leader_role IS NULL OR oa_leader_role IN ('delegate','activist','contact'));

COMMENT ON COLUMN campaign_worker_membership.oa_leader_role IS
  'Campaign-scoped OA leadership role. Re-added in 20260605 after being '
  'removed in 20260415 harmonisation: the leader-tasking trigger needs '
  'to mark task-list assignees as ''activist'' for THIS campaign without '
  'side-effecting workers.member_role_type_id (which is global). '
  'Hierarchy: contact < activist < delegate; the trigger never demotes.';

-- ─────────────────────────────────────────────────────────────
-- 8. Auto-side-effect trigger on campaign_task_list_items
-- ─────────────────────────────────────────────────────────────
-- Fires AFTER INSERT, mirrors 20260426100000_workplan_task_worker_autorating.sql.
-- For each task-list-item:
--   (a) If parent list has activity_id, upsert a rating=1 for the worker
--       (rating_phase='expected', source='task_take', event_id=NULL,
--        ON CONFLICT car_worker_phase_event_uq DO NOTHING). Skipped for
--        activity-less drafts.
--   (b) Upsert campaign_worker_membership: insert with oa_leader_role
--       'activist' if no row, promote NULL -> 'activist', leave 'delegate'
--       alone, leave 'activist' alone.
--   (c) Insert campaign_leader_worker_links if the parent task list has a
--       leader_worker_id different from the follower (leader != follower).
-- All three steps are idempotent (ON CONFLICT DO NOTHING / guarded UPDATEs).
CREATE OR REPLACE FUNCTION fn_task_list_item_side_effects()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_id    INT;
  v_activity_id    INT;
  v_leader_worker  INT;
  v_existing_role  VARCHAR(20);
BEGIN
  IF NEW.worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT campaign_id, activity_id, leader_worker_id
    INTO v_campaign_id, v_activity_id, v_leader_worker
  FROM campaign_task_lists
  WHERE task_list_id = NEW.task_list_id;

  IF v_campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) Auto-rate (only if the list is bound to an activity)
  IF v_activity_id IS NOT NULL THEN
    INSERT INTO campaign_activity_ratings (
      activity_id, worker_id, rating, rating_phase, event_id,
      source, notes, rated_at
    )
    VALUES (
      v_activity_id, NEW.worker_id, 1, 'expected', NULL,
      'task_take', 'Auto-set from task list assignment', now()
    )
    ON CONFLICT ON CONSTRAINT car_worker_phase_event_uq DO NOTHING;
  END IF;

  -- (b) Auto-promote campaign membership to 'activist' (campaign-scoped)
  SELECT oa_leader_role INTO v_existing_role
  FROM campaign_worker_membership
  WHERE campaign_id = v_campaign_id
    AND worker_id = NEW.worker_id;

  IF NOT FOUND THEN
    INSERT INTO campaign_worker_membership (campaign_id, worker_id, oa_leader_role)
    VALUES (v_campaign_id, NEW.worker_id, 'activist')
    ON CONFLICT (campaign_id, worker_id) DO NOTHING;
  ELSIF v_existing_role IS NULL THEN
    UPDATE campaign_worker_membership
    SET oa_leader_role = 'activist'
    WHERE campaign_id = v_campaign_id
      AND worker_id = NEW.worker_id
      AND oa_leader_role IS NULL;
  END IF;
  -- 'delegate' / 'activist' / 'contact' already-set rows are left alone.

  -- (c) Auto-link leader -> follower (only if leader is a worker and
  --     not the same person as the assignee)
  IF v_leader_worker IS NOT NULL AND v_leader_worker <> NEW.worker_id THEN
    INSERT INTO campaign_leader_worker_links (
      campaign_id, leader_worker_id, follower_worker_id, notes
    )
    VALUES (
      v_campaign_id, v_leader_worker, NEW.worker_id,
      'Auto-linked via task list'
    )
    ON CONFLICT ON CONSTRAINT uniq_campaign_leader_follower DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Swallow errors to keep the user-facing insert resilient; the trigger
  -- is best-effort and reruns idempotently on the next item insert.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_task_list_item_side_effects() IS
  'Single AFTER INSERT trigger function on campaign_task_list_items that '
  '(1) writes a rating=1 expected/task_take row, (2) marks the worker '
  'as ''activist'' in campaign_worker_membership without demoting an '
  'existing higher role, and (3) inserts a leader->follower link when '
  'the parent list has a leader_worker_id. Idempotent; safe to fire '
  'twice for the same row.';

DROP TRIGGER IF EXISTS trg_task_list_item_side_effects ON campaign_task_list_items;
CREATE TRIGGER trg_task_list_item_side_effects
  AFTER INSERT ON campaign_task_list_items
  FOR EACH ROW EXECUTE FUNCTION fn_task_list_item_side_effects();
