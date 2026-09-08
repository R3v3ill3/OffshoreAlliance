-- ============================================================
-- Migration: Revert per-campaign oa_leader_role; auto-promote on
-- the global workers.member_role_type_id instead.
--
-- Phase 1 (20260605100000_leader_tasking_enhanced.sql) re-introduced
-- oa_leader_role on campaign_worker_membership and made the task-list
-- auto-promotion campaign-scoped. That conflicts with the canonical
-- model established by 20260415100000_leadership_harmonisation.sql:
-- union role (contact / activist / delegate) is a GLOBAL property of
-- the worker, not a per-campaign attribute. If a worker is designated
-- as activist/delegate via campaign activity, the designation persists
-- across all campaigns.
--
-- This migration:
--   1. Replaces fn_task_list_item_side_effects() so step (b) updates
--      workers.member_role_type_id rather than oa_leader_role.
--   2. Drops the oa_leader_role column (verified empty: 0/673 rows
--      had a non-null value at the time of writing).
--
-- Promotion semantics:
--   • If workers.member_role_type_id IS NULL or points to a non-leader
--     role (anything other than contact/activist/delegate) → set to
--     activist (role_name ILIKE 'activist').
--   • If already contact / activist / delegate → leave alone. We do
--     NOT downgrade contact, do NOT upgrade contact to activist (a
--     contact is an intentional softer designation), and do NOT
--     downgrade delegate.
--   • This means task-allocation auto-promotion is a one-way ratchet
--     that only fires for workers without an existing leadership role.
--
-- A separate UI surface (NOT a trigger — see plan) handles the
-- "rated 1 supportive_leader → confirm union role" prompt.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Replace fn_task_list_item_side_effects with the global-role version
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_task_list_item_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id   INT;
  v_activity_id   INT;
  v_leader_id     INT;
  v_existing_role INT;
  v_activist_id   INT;
  v_contact_id    INT;
  v_delegate_id   INT;
BEGIN
  -- Resolve parent task list context
  SELECT campaign_id, activity_id, leader_worker_id
    INTO v_campaign_id, v_activity_id, v_leader_id
  FROM campaign_task_lists
  WHERE task_list_id = NEW.task_list_id;

  IF v_campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve canonical role IDs by name (case-insensitive)
  SELECT role_type_id INTO v_activist_id
    FROM member_role_types WHERE role_name ILIKE 'activist' LIMIT 1;
  SELECT role_type_id INTO v_contact_id
    FROM member_role_types WHERE role_name ILIKE 'contact' LIMIT 1;
  SELECT role_type_id INTO v_delegate_id
    FROM member_role_types WHERE role_name ILIKE 'delegate' LIMIT 1;

  -- (a) Auto-rate (skip if no activity linked)
  IF v_activity_id IS NOT NULL THEN
    INSERT INTO campaign_activity_ratings
      (activity_id, worker_id, rating, rating_phase, source, notes, rated_at)
    VALUES
      (v_activity_id, NEW.worker_id, 1, 'expected', 'task_take',
       'Auto-set from task list assignment', now())
    ON CONFLICT ON CONSTRAINT car_worker_phase_event_uq DO NOTHING;
  END IF;

  -- (b) Ensure campaign membership row (no role tracking on this table)
  INSERT INTO campaign_worker_membership (campaign_id, worker_id)
  VALUES (v_campaign_id, NEW.worker_id)
  ON CONFLICT (campaign_id, worker_id) DO NOTHING;

  -- (b') Global role auto-promote: only when the worker has no leadership
  -- role yet. Never downgrade an existing contact / activist / delegate.
  IF v_activist_id IS NOT NULL THEN
    SELECT member_role_type_id INTO v_existing_role
      FROM workers WHERE worker_id = NEW.worker_id;

    IF v_existing_role IS NULL
       OR (v_existing_role <> v_contact_id
           AND v_existing_role <> v_activist_id
           AND v_existing_role <> v_delegate_id) THEN
      UPDATE workers
        SET member_role_type_id = v_activist_id,
            updated_at = now()
      WHERE worker_id = NEW.worker_id;
    END IF;
  END IF;

  -- (c) Leader → follower link
  IF v_leader_id IS NOT NULL AND v_leader_id <> NEW.worker_id THEN
    INSERT INTO campaign_leader_worker_links
      (campaign_id, leader_worker_id, follower_worker_id, notes)
    VALUES
      (v_campaign_id, v_leader_id, NEW.worker_id, 'Auto-linked via task list')
    ON CONFLICT ON CONSTRAINT uniq_campaign_leader_follower DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Mirror existing convention from 20260426100000_workplan_task_worker_autorating.sql:
  -- never let trigger errors block the parent insert.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_task_list_item_side_effects() IS
  'After a campaign_task_list_items row is inserted, performs three '
  'idempotent side-effects: (a) upsert a 1=supportive_leader rating '
  'phase=expected source=task_take on the activity (skipped if no '
  'activity linked); (b) ensure a campaign_worker_membership row '
  'exists, then promote workers.member_role_type_id to activist if '
  'the worker has no existing leadership role (contact/activist/'
  'delegate are left untouched); (c) insert a leader→follower link '
  'in campaign_leader_worker_links. Errors are swallowed by design.';

-- ─────────────────────────────────────────────────────────────
-- 2. Drop the spurious oa_leader_role column
--    Verified empty (0/673 rows non-null) before drop.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE campaign_worker_membership
  DROP CONSTRAINT IF EXISTS campaign_worker_membership_oa_leader_role_chk;

ALTER TABLE campaign_worker_membership
  DROP COLUMN IF EXISTS oa_leader_role;
