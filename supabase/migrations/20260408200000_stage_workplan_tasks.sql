-- ============================================================
-- Migration: Stage Workplan Tasks
-- Operational tasks linked to campaign stages and ambitions,
-- enabling non-linear planning where work can begin before
-- strategic planning is complete.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_stage_workplan_tasks (
  task_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
  plan_ambition_id INT REFERENCES plan_ambitions(ambition_id) ON DELETE SET NULL,
  title VARCHAR(400) NOT NULL,
  description TEXT,
  task_type VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (task_type IN ('discovery', 'outreach', 'mapping', 'engagement', 'admin', 'other')),
  status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'blocked', 'cancelled')),
  assigned_organiser_id INT REFERENCES organisers(organiser_id) ON DELETE SET NULL,
  assigned_ou_id INT REFERENCES campaign_organising_units(ou_id) ON DELETE SET NULL,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  priority INT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  outcome_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_workplan_tasks_updated_at
  BEFORE UPDATE ON campaign_stage_workplan_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_swt_campaign ON campaign_stage_workplan_tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_swt_campaign_stage ON campaign_stage_workplan_tasks(campaign_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_swt_ambition ON campaign_stage_workplan_tasks(plan_ambition_id);
CREATE INDEX IF NOT EXISTS idx_swt_ou ON campaign_stage_workplan_tasks(assigned_ou_id);
CREATE INDEX IF NOT EXISTS idx_swt_organiser ON campaign_stage_workplan_tasks(assigned_organiser_id);

-- RLS
ALTER TABLE campaign_stage_workplan_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read campaign_stage_workplan_tasks"
  ON campaign_stage_workplan_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/User can insert campaign_stage_workplan_tasks"
  ON campaign_stage_workplan_tasks FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin/User can update campaign_stage_workplan_tasks"
  ON campaign_stage_workplan_tasks FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin can delete campaign_stage_workplan_tasks"
  ON campaign_stage_workplan_tasks FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- View: workplan progress per stage per ambition
CREATE OR REPLACE VIEW campaign_stage_workplan_progress
WITH (security_invoker = true)
AS
SELECT
  t.campaign_id,
  t.stage_number,
  t.plan_ambition_id,
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_tasks,
  COUNT(*) FILTER (WHERE t.status = 'in_progress') AS in_progress_tasks,
  COUNT(*) FILTER (WHERE t.status = 'blocked') AS blocked_tasks,
  COUNT(*) FILTER (WHERE t.status = 'planned') AS planned_tasks,
  COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled_tasks,
  CASE
    WHEN COUNT(*) FILTER (WHERE t.status != 'cancelled') > 0 THEN
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE t.status = 'completed')
        / COUNT(*) FILTER (WHERE t.status != 'cancelled'),
        1
      )
    ELSE 0
  END AS completion_pct
FROM campaign_stage_workplan_tasks t
GROUP BY t.campaign_id, t.stage_number, t.plan_ambition_id;

GRANT SELECT ON campaign_stage_workplan_progress TO authenticated;

-- Update delete_campaign RPC to clean up workplan tasks
CREATE OR REPLACE FUNCTION public.delete_campaign(p_campaign_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (public.is_admin() OR public.is_lead_organiser_for_campaign(p_campaign_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM campaigns WHERE campaign_id = p_campaign_id) THEN
    RAISE EXCEPTION 'campaign_not_found';
  END IF;

  DELETE FROM campaign_stage_workplan_tasks WHERE campaign_id = p_campaign_id;

  DELETE FROM gate_assessments ga
  USING gate_definitions gd
  WHERE ga.gate_id = gd.gate_id AND gd.campaign_id = p_campaign_id;

  DELETE FROM gate_definitions WHERE campaign_id = p_campaign_id;

  DELETE FROM campaign_stage_plans WHERE campaign_id = p_campaign_id;

  DELETE FROM reporting_snapshots WHERE campaign_id = p_campaign_id;

  DELETE FROM campaign_timelines WHERE campaign_id = p_campaign_id;

  DELETE FROM campaigns WHERE campaign_id = p_campaign_id;
END;
$$;
