-- ============================================================
-- Migration: Worker Leadership Role Harmonisation
--
-- Consolidates three overlapping role systems into a single
-- enduring role model:
--   1. Adds workers.is_bargaining_rep boolean flag
--   2. Migrates bargaining_rep from member_role_types hierarchy
--      to the new boolean flag
--   3. Reconciles oa_leader_role -> member_role_type_id
--   4. Reconciles engagement_level -> member_role_type_id
--   5. Drops redundant columns
--   6. Updates dependent views
--   7. Adds auto-behaviour triggers for task list assignment
-- ============================================================

-- ── 1. Add is_bargaining_rep boolean to workers ──────────────

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_bargaining_rep BOOLEAN;

-- ── 2. Migrate bargaining_rep data ───────────────────────────
-- Workers with member_role_type_id = 4 (bargaining_rep) get the
-- boolean flag set, then their hierarchy role is re-assigned to
-- the next best: Delegate (7) if member-like, else Activist (8).

UPDATE workers
SET is_bargaining_rep = TRUE
WHERE member_role_type_id = 4;

UPDATE workers
SET member_role_type_id = 7  -- Delegate
WHERE member_role_type_id = 4
  AND (
    union_membership_type_id IS NOT NULL
    OR member_role_type_id IN (4, 7) -- already member-like
  );

UPDATE workers
SET member_role_type_id = 8  -- Activist
WHERE member_role_type_id = 4;

-- Deactivate bargaining_rep row from the role types lookup
UPDATE member_role_types
SET is_active = FALSE
WHERE role_type_id = 4;

-- ── 3. Reconcile oa_leader_role into member_role_type_id ─────
-- Role hierarchy: Contact (3) < Activist (8) < Delegate (7)
-- Promote the global role if the campaign role is higher.

-- Workers who are activist in any campaign but have no role or Contact globally
UPDATE workers w
SET member_role_type_id = 8  -- Activist
FROM campaign_worker_membership cwm
WHERE cwm.worker_id = w.worker_id
  AND cwm.oa_leader_role = 'activist'
  AND (w.member_role_type_id IS NULL OR w.member_role_type_id = 3);

-- Workers who are delegate in any campaign but have no role, Contact, or Activist globally
UPDATE workers w
SET member_role_type_id = 7  -- Delegate
FROM campaign_worker_membership cwm
WHERE cwm.worker_id = w.worker_id
  AND cwm.oa_leader_role = 'delegate'
  AND (w.member_role_type_id IS NULL OR w.member_role_type_id IN (3, 8));

-- ── 4. Reconcile engagement_level into member_role_type_id ───
-- Map: attendee/leader -> Activist, activist -> Activist,
-- delegate -> Delegate. Only promote if currently lower.

UPDATE workers
SET member_role_type_id = 8  -- Activist
WHERE engagement_level IN ('activist', 'attendee', 'leader')
  AND (member_role_type_id IS NULL OR member_role_type_id = 3);

UPDATE workers
SET member_role_type_id = 7  -- Delegate
WHERE engagement_level = 'delegate'
  AND (member_role_type_id IS NULL OR member_role_type_id IN (3, 8));

-- ── 5. Drop redundant columns ────────────────────────────────

ALTER TABLE campaign_worker_membership
  DROP COLUMN IF EXISTS oa_leader_role;

ALTER TABLE workers
  DROP COLUMN IF EXISTS engagement_level;

ALTER TABLE workers
  DROP COLUMN IF EXISTS engagement_score;

-- ── 6. Update dependent views ────────────────────────────────

-- 6a. campaign_ou_coverage_summary: replace oa_leader_role with
-- member_role_types join via workers
CREATE OR REPLACE VIEW campaign_ou_coverage_summary
WITH (security_invoker = true)
AS
SELECT
  c.campaign_id,
  COUNT(ou.ou_id) AS total_ous,
  COUNT(ou.ou_id) FILTER (
    WHERE ou.total_workers_estimated BETWEEN 5 AND 50
  ) AS sized_ous,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM campaign_worker_ou cwou
    JOIN workers w ON w.worker_id = cwou.worker_id
    JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
    WHERE cwou.ou_id = ou.ou_id AND mrt.role_name = 'contact'
  )) AS ous_with_contact,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM campaign_worker_ou cwou
    JOIN workers w ON w.worker_id = cwou.worker_id
    JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
    WHERE cwou.ou_id = ou.ou_id AND mrt.role_name = 'Activist'
  )) AS ous_with_activist,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM campaign_worker_ou cwou
    JOIN workers w ON w.worker_id = cwou.worker_id
    JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
    WHERE cwou.ou_id = ou.ou_id AND mrt.role_name = 'delegate'
  )) AS ous_with_delegate,
  COUNT(DISTINCT ou.ou_id) FILTER (WHERE ou.anchor_worker_id IS NOT NULL) AS ous_with_anchor,
  COALESCE(SUM(ou.total_workers_estimated), 0) AS total_estimated_workers,
  (SELECT COUNT(DISTINCT cwou2.worker_id)
   FROM campaign_worker_ou cwou2
   JOIN campaign_organising_units ou2 ON ou2.ou_id = cwou2.ou_id
   WHERE ou2.campaign_id = c.campaign_id
  ) AS total_assigned_workers
FROM campaigns c
LEFT JOIN campaign_organising_units ou ON ou.campaign_id = c.campaign_id
GROUP BY c.campaign_id;

-- 6b. Update workers_view to remove engagement_level/engagement_score
CREATE OR REPLACE VIEW workers_view
WITH (security_invoker = true)
AS
SELECT
    w.worker_id,
    w.first_name,
    w.last_name,
    w.email,
    w.phone,
    w.address,
    w.suburb,
    w.state,
    w.postcode,
    w.date_of_birth,
    w.gender,
    w.occupation,
    w.classification,
    w.employer_id,
    w.worksite_id,
    w.member_role_type_id,
    w.union_id,
    w.member_number,
    w.join_date,
    w.resignation_date,
    w.action_network_id,
    w.notes,
    w.is_active,
    w.created_at,
    w.updated_at,
    w.project_id,
    w.canonical_occupation_id,
    w.preferred_name,
    w.union_membership_type_id,
    w.is_hsr,
    w.is_bargaining_rep,
    w.reference_id,
    w.rejoin_date,
    w.resignation_reason,
    e.employer_name,
    ws.worksite_name,
    ws.is_offshore,
    mrt.display_name AS member_role_display,
    umt.display_name AS union_membership_display,
    u.union_code,
    u.union_name,
    p.project_name,
    p.work_type,
    p.project_status
FROM workers w
LEFT JOIN employers e ON e.employer_id = w.employer_id
LEFT JOIN worksites ws ON ws.worksite_id = w.worksite_id
LEFT JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
LEFT JOIN union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
LEFT JOIN unions u ON u.union_id = w.union_id
LEFT JOIN projects p ON p.project_id = w.project_id;

-- 6c. Update workload_campaign_entities leader count to also
-- count workers who have a leadership role (not just task list leaders)
-- Keep existing task-list-based counting as-is for now; the view
-- references campaign_task_lists which does not use oa_leader_role.

-- ── 7. Auto-behaviour triggers ───────────────────────────────

-- 7a. When a task list item is inserted, auto-insert a rating of 1
-- for the linked activity (if no rating exists for that worker+activity).
CREATE OR REPLACE FUNCTION fn_auto_rate_on_task_list_item()
RETURNS TRIGGER AS $$
DECLARE
  v_activity_id INT;
BEGIN
  SELECT activity_id INTO v_activity_id
  FROM campaign_task_lists
  WHERE task_list_id = NEW.task_list_id;

  IF v_activity_id IS NOT NULL AND NEW.worker_id IS NOT NULL THEN
    INSERT INTO campaign_activity_ratings (activity_id, worker_id, rating, source, rated_at)
    VALUES (v_activity_id, NEW.worker_id, 1, 'staff', now())
    ON CONFLICT (activity_id, worker_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_rate_task_list_item ON campaign_task_list_items;
CREATE TRIGGER trg_auto_rate_task_list_item
  AFTER INSERT ON campaign_task_list_items
  FOR EACH ROW EXECUTE FUNCTION fn_auto_rate_on_task_list_item();

-- 7b. When a task list is created with a leader_worker_id,
-- auto-promote that worker to at least Activist (role_type_id = 8).
CREATE OR REPLACE FUNCTION fn_auto_promote_task_list_leader()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.leader_worker_id IS NOT NULL THEN
    UPDATE workers
    SET member_role_type_id = 8  -- Activist
    WHERE worker_id = NEW.leader_worker_id
      AND (member_role_type_id IS NULL OR member_role_type_id = 3);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_promote_task_list_leader ON campaign_task_lists;
CREATE TRIGGER trg_auto_promote_task_list_leader
  AFTER INSERT OR UPDATE OF leader_worker_id ON campaign_task_lists
  FOR EACH ROW EXECUTE FUNCTION fn_auto_promote_task_list_leader();
