-- ============================================================
-- Split union membership from member_role_types; HSR on workers
-- ============================================================

CREATE TABLE union_membership_types (
  union_membership_type_id SERIAL PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO union_membership_types (type_name, display_name, is_default, sort_order) VALUES
  ('non_member', 'Non-member', true, 1),
  ('resigned_member', 'Resigned member', true, 2),
  ('financial_member', 'Financial member', true, 3),
  ('non_oa_member', 'Non-OA member', true, 4);

ALTER TABLE workers
  ADD COLUMN union_membership_type_id INT REFERENCES union_membership_types(union_membership_type_id),
  ADD COLUMN is_hsr BOOLEAN;

COMMENT ON COLUMN workers.is_hsr IS 'Health and safety representative; NULL = not specified, true = HSR';

CREATE INDEX idx_workers_union_membership ON workers(union_membership_type_id);

-- Backfill union_membership_type_id from legacy member_role_types
UPDATE workers w
SET union_membership_type_id = umt.union_membership_type_id
FROM member_role_types mrt
JOIN union_membership_types umt ON (
  (mrt.role_name = 'member' AND umt.type_name = 'financial_member')
  OR (mrt.role_name = 'member_other_union' AND umt.type_name = 'non_oa_member')
  OR (mrt.role_name = 'non_member' AND umt.type_name = 'non_member')
  OR (mrt.role_name = 'resigned_member' AND umt.type_name = 'resigned_member')
)
WHERE w.member_role_type_id = mrt.role_type_id;

-- Membership-only categories no longer use member_role_type_id
UPDATE workers w
SET member_role_type_id = NULL
FROM member_role_types mrt
WHERE w.member_role_type_id = mrt.role_type_id
  AND mrt.role_name IN ('member', 'member_other_union', 'non_member', 'resigned_member');

DELETE FROM campaign_universe_rules cur
USING member_role_types mrt
WHERE cur.rule_type = 'member_role'
  AND cur.rule_entity_id = mrt.role_type_id
  AND mrt.role_name IN ('member', 'member_other_union', 'non_member', 'resigned_member');

DELETE FROM member_role_types
WHERE role_name IN ('member', 'member_other_union', 'non_member', 'resigned_member');

ALTER TABLE union_membership_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read union_membership_types"
  ON union_membership_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/User can insert union_membership_types"
  ON union_membership_types FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin/User can update union_membership_types"
  ON union_membership_types FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin can delete union_membership_types"
  ON union_membership_types FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

DROP VIEW IF EXISTS workers_view CASCADE;

CREATE OR REPLACE VIEW workers_view AS
SELECT
  w.*,
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
