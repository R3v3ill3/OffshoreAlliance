-- ============================================================
-- Migration: Workplan task worker assignees + auto-rating
--
-- Today `campaign_stage_workplan_tasks` can be assigned to an
-- organiser or an organising unit, but not to an individual
-- worker. The workflow needs: "ask Jane (delegate) to get me
-- the phone list for shift B" — a task put on a leader for a
-- list-building (non-assessable) ambition. Equally, a workplan
-- task linked to a worker-assessable ambition that a worker
-- accepts should promote that worker to a rating=1 on the
-- activity(ies) linked to the ambition.
--
-- This migration:
--   1. Adds assigned_worker_id to campaign_stage_workplan_tasks.
--   2. Adds a trigger that — whenever a task gains a worker
--      assignee AND its ambition is worker_assessable — writes
--      a rating=1 row to the first activity linked to that
--      ambition via activity_ambitions, using source='task_take'.
--   3. Non-assessable ambition tasks (e.g. list-building) just
--      get the assignment; no rating is created.
-- ============================================================

-- 1. Column + index
ALTER TABLE campaign_stage_workplan_tasks
  ADD COLUMN IF NOT EXISTS assigned_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_swt_worker ON campaign_stage_workplan_tasks(assigned_worker_id)
  WHERE assigned_worker_id IS NOT NULL;

COMMENT ON COLUMN campaign_stage_workplan_tasks.assigned_worker_id IS
  'Worker (leader, delegate, activist, contact) this task is assigned to. '
  'When combined with a worker_assessable plan_ambition_id, triggers an '
  'auto-rating of 1 (supportive leader) on the first activity linked to '
  'that ambition.';

-- 2. Trigger: on INSERT or UPDATE of assigned_worker_id, auto-rate
CREATE OR REPLACE FUNCTION fn_auto_rate_workplan_task_worker()
RETURNS TRIGGER AS $$
DECLARE
  v_scope VARCHAR(20);
  v_activity_id INT;
BEGIN
  IF NEW.assigned_worker_id IS NULL OR NEW.plan_ambition_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only worker_assessable ambitions produce ratings
  SELECT ambition_scope INTO v_scope
  FROM plan_ambitions
  WHERE ambition_id = NEW.plan_ambition_id;

  IF v_scope IS DISTINCT FROM 'worker_assessable' THEN
    RETURN NEW;
  END IF;

  -- First linked activity via activity_ambitions
  SELECT aa.activity_id INTO v_activity_id
  FROM activity_ambitions aa
  WHERE aa.plan_ambition_id = NEW.plan_ambition_id
  ORDER BY aa.is_primary DESC, aa.id ASC
  LIMIT 1;

  IF v_activity_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM record_assessment_event(
    p_activity_id := v_activity_id,
    p_worker_id := NEW.assigned_worker_id,
    p_rating := 1,
    p_binary_value := NULL,
    p_rating_phase := 'actual',
    p_event_id := NULL,
    p_source := 'task_take',
    p_notes := NULL,
    p_actor_id := NULL
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_rate_workplan_task_worker ON campaign_stage_workplan_tasks;
CREATE TRIGGER trg_auto_rate_workplan_task_worker
  AFTER INSERT OR UPDATE OF assigned_worker_id, plan_ambition_id
  ON campaign_stage_workplan_tasks
  FOR EACH ROW EXECUTE FUNCTION fn_auto_rate_workplan_task_worker();
