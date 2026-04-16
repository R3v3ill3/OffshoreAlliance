-- ============================================================
-- Migration: Fix task list auto-behaviour triggers
--
-- 1. Remove the auto-rate trigger on campaign_task_list_items.
--    Workers added to a task list are there for assessment by
--    the leader; they should NOT be pre-rated.
--
-- 2. Enhance the leader promotion trigger to also auto-rate
--    the leader as 1 (supportive leader) for the linked
--    activity, in addition to the existing role promotion.
-- ============================================================

-- ── 1. Drop the worker auto-rate trigger and function ───────

DROP TRIGGER IF EXISTS trg_auto_rate_task_list_item ON campaign_task_list_items;
DROP FUNCTION IF EXISTS fn_auto_rate_on_task_list_item();

-- ── 2. Replace leader trigger: promote + auto-rate leader ───

CREATE OR REPLACE FUNCTION fn_auto_promote_task_list_leader()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.leader_worker_id IS NOT NULL THEN
    -- Promote to Activist if currently no role or Contact
    UPDATE workers
    SET member_role_type_id = 8  -- Activist
    WHERE worker_id = NEW.leader_worker_id
      AND (member_role_type_id IS NULL OR member_role_type_id = 3);

    -- Rate the leader as 1 (supportive leader) for the linked activity
    IF NEW.activity_id IS NOT NULL THEN
      INSERT INTO campaign_activity_ratings
        (activity_id, worker_id, rating, source, rated_at)
      VALUES
        (NEW.activity_id, NEW.leader_worker_id, 1, 'staff', now())
      ON CONFLICT (activity_id, worker_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists from the harmonisation migration;
-- recreate to ensure the updated function is wired correctly.
DROP TRIGGER IF EXISTS trg_auto_promote_task_list_leader ON campaign_task_lists;
CREATE TRIGGER trg_auto_promote_task_list_leader
  AFTER INSERT OR UPDATE OF leader_worker_id ON campaign_task_lists
  FOR EACH ROW EXECUTE FUNCTION fn_auto_promote_task_list_leader();
