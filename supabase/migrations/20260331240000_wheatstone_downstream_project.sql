-- ============================================================
-- Migration: Wheatstone LNG (Downstream) production project
-- ============================================================
-- Wheatstone LNG (Downstream) is a distinct Chevron onshore
-- facility producing domestic gas, separate from the Wheatstone
-- LNG export trains. Confirmed as a genuine production site.
-- Adding a production project so it appears correctly in
-- organising universe queries filtered by work_type.
-- ============================================================

INSERT INTO projects (project_name, worksite_id, work_type, project_status, is_active)
SELECT 'Wheatstone Domestic Gas Production', ws.worksite_id, 'production', 'operational', true
FROM worksites ws
WHERE ws.worksite_name = 'Wheatstone LNG (Downstream)'
  AND NOT EXISTS (
    SELECT 1 FROM projects
    WHERE worksite_id = ws.worksite_id AND work_type = 'production'
  );
