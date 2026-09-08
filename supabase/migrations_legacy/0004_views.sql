-- ============================================================
-- Database Views for common queries
-- ============================================================

-- Agreements with all related data
CREATE OR REPLACE VIEW agreements_view AS
SELECT
  a.*,
  s.sector_name,
  e.employer_name,
  e.trading_name AS employer_trading_name,
  (
    SELECT string_agg(u.union_code, ', ' ORDER BY au.is_primary DESC, u.union_code)
    FROM agreement_unions au
    JOIN unions u ON u.union_id = au.union_id
    WHERE au.agreement_id = a.agreement_id
  ) AS union_coverage,
  (
    SELECT COUNT(*)::int
    FROM agreement_worksites aw
    WHERE aw.agreement_id = a.agreement_id
  ) AS worksite_count,
  CASE
    WHEN a.expiry_date IS NULL THEN NULL
    WHEN a.expiry_date < CURRENT_DATE THEN 0
    ELSE (a.expiry_date - CURRENT_DATE)
  END AS days_until_expiry
FROM agreements a
LEFT JOIN sectors s ON s.sector_id = a.sector_id
LEFT JOIN employers e ON e.employer_id = a.employer_id;

-- Workers with related data
CREATE OR REPLACE VIEW workers_view AS
SELECT
  w.*,
  e.employer_name,
  ws.worksite_name,
  mrt.display_name AS member_role_display,
  u.union_code,
  u.union_name
FROM workers w
LEFT JOIN employers e ON e.employer_id = w.employer_id
LEFT JOIN worksites ws ON ws.worksite_id = w.worksite_id
LEFT JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
LEFT JOIN unions u ON u.union_id = w.union_id;

-- Worksites with operator info and counts
CREATE OR REPLACE VIEW worksites_view AS
SELECT
  ws.*,
  e.employer_name AS operator_name,
  (
    SELECT COUNT(*)::int
    FROM agreement_worksites aw
    WHERE aw.worksite_id = ws.worksite_id
  ) AS agreement_count,
  (
    SELECT COUNT(*)::int
    FROM workers w
    WHERE w.worksite_id = ws.worksite_id AND w.is_active = true
  ) AS worker_count
FROM worksites ws
LEFT JOIN employers e ON e.employer_id = ws.operator_id;

-- Employers with counts
CREATE OR REPLACE VIEW employers_view AS
SELECT
  emp.*,
  (
    SELECT COUNT(*)::int
    FROM agreements a
    WHERE a.employer_id = emp.employer_id
  ) AS agreement_count,
  (
    SELECT COUNT(DISTINCT ewr.worksite_id)::int
    FROM employer_worksite_roles ewr
    WHERE ewr.employer_id = emp.employer_id AND ewr.is_current = true
  ) AS worksite_count,
  (
    SELECT COUNT(*)::int
    FROM workers w
    WHERE w.employer_id = emp.employer_id AND w.is_active = true
  ) AS worker_count,
  (
    SELECT string_agg(DISTINCT s.sector_name, ', ' ORDER BY s.sector_name)
    FROM employer_sectors es
    JOIN sectors s ON s.sector_id = es.sector_id
    WHERE es.employer_id = emp.employer_id
  ) AS sector_names
FROM employers emp;

-- Campaign summary
CREATE OR REPLACE VIEW campaigns_view AS
SELECT
  c.*,
  o.organiser_name,
  (
    SELECT COUNT(*)::int
    FROM campaign_actions ca
    WHERE ca.campaign_id = c.campaign_id
  ) AS action_count,
  (
    SELECT COUNT(*)::int
    FROM campaign_universes cu
    WHERE cu.campaign_id = c.campaign_id
  ) AS universe_count
FROM campaigns c
LEFT JOIN organisers o ON o.organiser_id = c.organiser_id;
