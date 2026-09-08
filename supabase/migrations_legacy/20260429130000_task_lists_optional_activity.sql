-- ============================================================
-- Migration: Make campaign_task_lists.activity_id nullable
--
-- Context: we now allow creating a leader task list without
-- tying it to a specific activity ("standalone tasks").
-- The existing auto-promote/auto-rate trigger
-- (fn_auto_promote_task_list_leader, migration 20260416220000)
-- already guards the rating insert with
--   IF NEW.activity_id IS NOT NULL THEN ... END IF;
-- so no function changes are required here.
--
-- The item-level auto-rate trigger in the leadership
-- harmonisation migration (20260415100000) similarly guards
-- with IF v_activity_id IS NOT NULL, so items on a standalone
-- list simply skip rating creation.
-- ============================================================

ALTER TABLE campaign_task_lists
  ALTER COLUMN activity_id DROP NOT NULL;
