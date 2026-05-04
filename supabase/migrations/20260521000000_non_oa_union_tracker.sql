-- ============================================================
-- Non-OA member → other union catalog (badge + FK on workers)
-- ============================================================

CREATE TABLE non_oa_union_options (
  non_oa_union_option_id SERIAL PRIMARY KEY,
  badge_initials TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE non_oa_union_options IS
  'Catalogued “other unions” for workers with union_membership_types.type_name = non_oa_member.';

CREATE INDEX idx_non_oa_union_options_sort ON non_oa_union_options (sort_order);

INSERT INTO non_oa_union_options (badge_initials, display_name, sort_order, is_builtin)
VALUES
  ('ETU', 'Electrical Trades Union (ETU)', 10, true),
  ('AMWU', 'Australian Manufacturing Workers'' Union', 20, true),
  ('MUA', 'Maritime Union of Australia', 30, true),
  ('PAU', 'Professionals Australia', 40, true),
  ('PBTU', 'Pilbara Building Trade Union', 50, true),
  ('CFMEU', 'CFMEU', 60, true),
  ('AWU-D', 'AWU – direct', 70, true),
  ('OTHER', 'Other (unspecified)', 80, true);

ALTER TABLE workers
  ADD COLUMN non_oa_union_option_id INT REFERENCES non_oa_union_options (non_oa_union_option_id) ON DELETE SET NULL;

CREATE INDEX idx_workers_non_oa_union_option ON workers (non_oa_union_option_id);

CREATE OR REPLACE FUNCTION workers_normalize_non_oa_union_option()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
BEGIN
  IF NEW.union_membership_type_id IS NULL THEN
    NEW.non_oa_union_option_id := NULL;
    RETURN NEW;
  END IF;

  SELECT umt.type_name INTO v_type
  FROM union_membership_types umt
  WHERE umt.union_membership_type_id = NEW.union_membership_type_id;

  IF v_type IS DISTINCT FROM 'non_oa_member' THEN
    NEW.non_oa_union_option_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workers_normalize_non_oa_union_option ON workers;
CREATE TRIGGER trg_workers_normalize_non_oa_union_option
  BEFORE INSERT OR UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION workers_normalize_non_oa_union_option();

ALTER TABLE non_oa_union_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read non_oa_union_options"
  ON non_oa_union_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/User can insert non_oa_union_options"
  ON non_oa_union_options FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin/User can update non_oa_union_options"
  ON non_oa_union_options FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin can delete non_builtin non_oa_union_options"
  ON non_oa_union_options FOR DELETE TO authenticated
  USING (
    get_user_role() = 'admin'
    AND is_builtin IS NOT TRUE
  );

GRANT SELECT ON non_oa_union_options TO authenticated;
GRANT ALL ON non_oa_union_options TO service_role;

-- workers_view includes joined initials for dashboards
DROP VIEW IF EXISTS workers_view;

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
  w.non_oa_union_option_id,
  e.employer_name,
  ws.worksite_name,
  ws.is_offshore,
  mrt.display_name AS member_role_display,
  umt.display_name AS union_membership_display,
  u.union_code,
  u.union_name,
  nauo.badge_initials AS non_oa_union_badge_initials,
  nauo.display_name AS non_oa_union_display_name,
  p.project_name,
  p.work_type,
  p.project_status
FROM workers w
LEFT JOIN employers e ON e.employer_id = w.employer_id
LEFT JOIN worksites ws ON ws.worksite_id = w.worksite_id
LEFT JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
LEFT JOIN union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
LEFT JOIN unions u ON u.union_id = w.union_id
LEFT JOIN projects p ON p.project_id = w.project_id
LEFT JOIN non_oa_union_options nauo ON nauo.non_oa_union_option_id = w.non_oa_union_option_id;

GRANT SELECT ON workers_view TO authenticated;
