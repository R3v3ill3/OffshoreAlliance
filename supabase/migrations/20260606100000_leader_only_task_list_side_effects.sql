-- ============================================================
-- Migration: Leader-only task-list side effects
--
-- Fixes a bug where every worker added to a task list was being
-- auto-rated as 1 (supportive_leader) and globally promoted to
-- the activist role by the AFTER-INSERT trigger on
-- campaign_task_list_items
-- (fn_task_list_item_side_effects, last redefined in
-- 20260605120000_revert_oa_leader_role_use_global.sql).
--
-- Workers placed on a leader's task list are there to be
-- *assessed by the leader*, not pre-rated. The intended design
-- (docs/worker-leadership-harmonisation.md §2.5) only ever
-- auto-rated and auto-role-promoted the LEADER, never the
-- assigned workers. This migration restores that contract:
--
--   1. fn_task_list_item_side_effects() is trimmed to keep only
--      the campaign-membership shell-row insert and the
--      leader -> follower link insert. No rating, no role change
--      for the assigned worker.
--   2. New fn_auto_rate_promote_task_list_leader() trigger fires
--      AFTER INSERT OR UPDATE OF (status, leader_worker_id,
--      activity_id) on campaign_task_lists, but only acts when
--      the row is status='active' AND has a leader_worker_id:
--        (a) If activity_id is set, upsert a rating=1
--            ('expected', source='task_take') for the LEADER on
--            that activity, idempotent via car_worker_phase_event_uq.
--        (b) If the leader's workers.member_role_type_id is not
--            already activist or delegate (i.e. NULL, contact,
--            member, non_member, etc.), promote it to activist.
--
-- Rules deliberately encoded:
--   - Drafts produce no rating/role side effects (per product
--     decision); the trigger waits for activation.
--   - Saving a draft and later activating it (UPDATE status to
--     'active') still fires the trigger because UPDATE OF status
--     is in the trigger spec.
--   - Contact -> activist IS performed for leaders (reverses the
--     contact carve-out from 20260605120000 because the new
--     wording is "ensure role is activist or delegate, set to
--     activist if not"). Workers who are already activist or
--     delegate are left untouched.
--   - Errors are swallowed by the EXCEPTION WHEN OTHERS handler,
--     matching convention elsewhere — these auto-side-effects
--     must never block the user-facing INSERT/UPDATE.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Trim fn_task_list_item_side_effects() to leader-link only
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_task_list_item_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id INT;
  v_leader_id   INT;
BEGIN
  IF NEW.worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT campaign_id, leader_worker_id
    INTO v_campaign_id, v_leader_id
  FROM campaign_task_lists
  WHERE task_list_id = NEW.task_list_id;

  IF v_campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ensure the worker has a campaign_worker_membership row so
  -- joins behave consistently. No role/rating change here.
  INSERT INTO campaign_worker_membership (campaign_id, worker_id)
  VALUES (v_campaign_id, NEW.worker_id)
  ON CONFLICT (campaign_id, worker_id) DO NOTHING;

  -- Leader -> follower link (only when the leader is a different worker).
  IF v_leader_id IS NOT NULL AND v_leader_id <> NEW.worker_id THEN
    INSERT INTO campaign_leader_worker_links
      (campaign_id, leader_worker_id, follower_worker_id, notes)
    VALUES
      (v_campaign_id, v_leader_id, NEW.worker_id, 'Auto-linked via task list')
    ON CONFLICT ON CONSTRAINT uniq_campaign_leader_follower DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_task_list_item_side_effects() IS
  'After a campaign_task_list_items row is inserted, performs two '
  'idempotent side-effects scoped to the assignee: (1) ensure a '
  'campaign_worker_membership shell row exists; (2) link the assignee '
  'as a follower of the parent task list''s leader_worker_id (when set '
  'and different from the assignee). No rating is created and no '
  'workers.member_role_type_id change is made for the assignee — those '
  'auto-effects are reserved for the LEADER only and live in '
  'fn_auto_rate_promote_task_list_leader(). Errors are swallowed by '
  'design to keep the parent INSERT resilient.';

-- ─────────────────────────────────────────────────────────────
-- 2. Leader-only auto-rate / auto-promote trigger on
--    campaign_task_lists. Fires only when the list is active.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_rate_promote_task_list_leader()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_role INT;
  v_activist_id   INT;
  v_delegate_id   INT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' OR NEW.leader_worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role_type_id INTO v_activist_id
    FROM member_role_types WHERE role_name ILIKE 'activist' LIMIT 1;
  SELECT role_type_id INTO v_delegate_id
    FROM member_role_types WHERE role_name ILIKE 'delegate' LIMIT 1;

  -- (a) Auto-rate the LEADER only, when an activity is linked.
  IF NEW.activity_id IS NOT NULL THEN
    INSERT INTO campaign_activity_ratings
      (activity_id, worker_id, rating, rating_phase, event_id,
       source, notes, rated_at)
    VALUES
      (NEW.activity_id, NEW.leader_worker_id, 1, 'expected', NULL,
       'task_take', 'Auto-set from task list leader assignment', now())
    ON CONFLICT ON CONSTRAINT car_worker_phase_event_uq DO NOTHING;
  END IF;

  -- (b) Ensure the leader's union role is activist OR delegate;
  --     promote to activist otherwise. Never demote a delegate.
  IF v_activist_id IS NOT NULL THEN
    SELECT member_role_type_id INTO v_existing_role
      FROM workers WHERE worker_id = NEW.leader_worker_id;

    IF v_existing_role IS NULL
       OR (v_existing_role <> v_activist_id
           AND (v_delegate_id IS NULL OR v_existing_role <> v_delegate_id)) THEN
      UPDATE workers
         SET member_role_type_id = v_activist_id,
             updated_at = now()
       WHERE worker_id = NEW.leader_worker_id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_auto_rate_promote_task_list_leader() IS
  'AFTER INSERT/UPDATE trigger on campaign_task_lists. When the row is '
  'status=''active'' AND has a leader_worker_id, performs two idempotent '
  'side-effects on the LEADER (and only the leader): (a) upsert a '
  'rating=1 (''expected'', source=''task_take'') for the leader on '
  'activity_id when set, deduped via car_worker_phase_event_uq; '
  '(b) if workers.member_role_type_id is not already activist or '
  'delegate, set it to activist. Drafts are no-ops. Errors swallowed.';

DROP TRIGGER IF EXISTS trg_auto_rate_promote_task_list_leader ON campaign_task_lists;
CREATE TRIGGER trg_auto_rate_promote_task_list_leader
  AFTER INSERT OR UPDATE OF status, leader_worker_id, activity_id
  ON campaign_task_lists
  FOR EACH ROW EXECUTE FUNCTION fn_auto_rate_promote_task_list_leader();
