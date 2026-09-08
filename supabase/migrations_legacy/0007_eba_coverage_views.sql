-- ============================================================
-- Migration 00007: EBA Coverage Views
-- ============================================================
-- EBA Status Categories (7 mutually exclusive, priority-ordered):
--   expiry_lt_6m         Current EBA expiring in < 6 months
--   expiry_6_12m         Current EBA expiring in 6–12 months
--   expiry_12_24m        Current EBA expiring in 12–24 months
--   expiry_gt_24m        Current EBA expiring in > 24 months (or no expiry date set)
--   first_bargaining     Under Negotiation with no prior Current/Expired EBA anywhere
--   expired_eba          Expired EBA (or bargaining on top of a prior expired EBA)
--   no_eba_no_bargaining No agreement at all

-- ============================================================
-- View 1: worksite_employer_eba_status
-- One row per current (employer, worksite) pair with computed EBA status.
-- ============================================================
CREATE OR REPLACE VIEW worksite_employer_eba_status AS
WITH employer_worksite_eba AS (
  -- All non-terminated agreements that cover a given employer at a given worksite.
  -- An agreement covers an employer if it is the primary employer OR listed in agreement_employers.
  SELECT
    ewr.employer_id,
    ewr.worksite_id,
    a.status      AS agreement_status,
    a.expiry_date
  FROM employer_worksite_roles ewr
  JOIN agreement_worksites aw ON aw.worksite_id = ewr.worksite_id
  JOIN agreements a           ON a.agreement_id = aw.agreement_id
  WHERE ewr.is_current = true
    AND a.status <> 'Terminated'
    AND (
      a.employer_id = ewr.employer_id
      OR EXISTS (
        SELECT 1 FROM agreement_employers ae
        WHERE ae.agreement_id = a.agreement_id
          AND ae.employer_id  = ewr.employer_id
      )
    )
),
employer_worksite_summary AS (
  -- Aggregate per (employer, worksite): best current expiry + flags
  SELECT
    ewr.employer_id,
    ewr.worksite_id,
    MAX(CASE WHEN eweba.agreement_status = 'Current' THEN eweba.expiry_date END) AS max_current_expiry,
    COALESCE(BOOL_OR(eweba.agreement_status = 'Current'),           false) AS has_current,
    COALESCE(BOOL_OR(eweba.agreement_status = 'Expired'),           false) AS has_expired,
    COALESCE(BOOL_OR(eweba.agreement_status = 'Under_Negotiation'), false) AS has_bargaining
  FROM employer_worksite_roles ewr
  LEFT JOIN employer_worksite_eba eweba
         ON eweba.employer_id = ewr.employer_id
        AND eweba.worksite_id = ewr.worksite_id
  WHERE ewr.is_current = true
  GROUP BY ewr.employer_id, ewr.worksite_id
),
employer_has_prior_eba AS (
  -- Employers that have at least one Current, Expired, or Terminated agreement
  -- anywhere in the system — used to distinguish "first bargaining" from subsequent rounds.
  SELECT DISTINCT employer_id FROM (
    SELECT employer_id FROM agreements
    WHERE  status IN ('Current', 'Expired', 'Terminated')
    UNION
    SELECT ae.employer_id
    FROM   agreement_employers ae
    JOIN   agreements a ON a.agreement_id = ae.agreement_id
    WHERE  a.status IN ('Current', 'Expired', 'Terminated')
  ) sub
)
SELECT
  ews.employer_id,
  ews.worksite_id,
  e.employer_name,
  ws.worksite_name,
  ws.principal_employer_id,
  pe.employer_name         AS principal_employer_name,
  e.parent_employer_id,
  -- EBA status category (priority order: current > bargaining > expired > none)
  CASE
    WHEN ews.has_current
         AND ews.max_current_expiry IS NOT NULL
         AND ews.max_current_expiry < CURRENT_DATE + INTERVAL '6 months'
      THEN 'expiry_lt_6m'
    WHEN ews.has_current
         AND ews.max_current_expiry IS NOT NULL
         AND ews.max_current_expiry < CURRENT_DATE + INTERVAL '12 months'
      THEN 'expiry_6_12m'
    WHEN ews.has_current
         AND ews.max_current_expiry IS NOT NULL
         AND ews.max_current_expiry < CURRENT_DATE + INTERVAL '24 months'
      THEN 'expiry_12_24m'
    WHEN ews.has_current
      THEN 'expiry_gt_24m'
    WHEN ews.has_bargaining AND epa.employer_id IS NULL
      THEN 'first_bargaining'
    WHEN ews.has_expired OR ews.has_bargaining
      THEN 'expired_eba'
    ELSE 'no_eba_no_bargaining'
  END                      AS eba_status_category,
  ews.max_current_expiry,
  ews.has_current,
  ews.has_expired,
  ews.has_bargaining
FROM employer_worksite_summary ews
JOIN  employers e  ON e.employer_id  = ews.employer_id
JOIN  worksites ws ON ws.worksite_id = ews.worksite_id
LEFT JOIN employers pe  ON pe.employer_id = ws.principal_employer_id
LEFT JOIN employer_has_prior_eba epa ON epa.employer_id = ews.employer_id;

-- ============================================================
-- View 2: principal_employer_eba_summary
-- Aggregated EBA status counts + percentages per Principal Employer.
-- Coverage scope = UNION of:
--   (a) employers at worksites with principal_employer_id = this PE
--   (b) employers whose parent_employer_id = this PE (across all their worksites)
-- ============================================================
CREATE OR REPLACE VIEW principal_employer_eba_summary AS
WITH pe_scope AS (
  -- Group A: employers at worksites assigned to this principal employer
  SELECT
    ws.principal_employer_id AS pe_id,
    ewr.employer_id,
    ewr.worksite_id
  FROM employer_worksite_roles ewr
  JOIN worksites ws ON ws.worksite_id = ewr.worksite_id
  WHERE ws.principal_employer_id IS NOT NULL
    AND ewr.is_current = true

  UNION

  -- Group B: employers whose parent is this principal employer, at their worksites
  SELECT
    e.parent_employer_id AS pe_id,
    ewr.employer_id,
    ewr.worksite_id
  FROM employers e
  JOIN employer_worksite_roles ewr ON ewr.employer_id = e.employer_id
  WHERE e.parent_employer_id IS NOT NULL
    AND ewr.is_current = true
),
scope_with_status AS (
  -- Deduplicate pairs and attach their computed EBA status
  SELECT DISTINCT
    ps.pe_id,
    wees.employer_id,
    wees.worksite_id,
    wees.eba_status_category
  FROM pe_scope ps
  JOIN worksite_employer_eba_status wees
    ON  wees.employer_id = ps.employer_id
    AND wees.worksite_id = ps.worksite_id
)
SELECT
  pe.employer_id      AS principal_employer_id,
  pe.employer_name    AS principal_employer_name,
  COUNT(*)            AS total_pairs,
  COUNT(*) FILTER (WHERE sws.eba_status_category = 'no_eba_no_bargaining') AS count_no_eba,
  COUNT(*) FILTER (WHERE sws.eba_status_category = 'first_bargaining')     AS count_first_bargaining,
  COUNT(*) FILTER (WHERE sws.eba_status_category = 'expired_eba')          AS count_expired,
  COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_lt_6m')         AS count_lt_6m,
  COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_6_12m')         AS count_6_12m,
  COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_12_24m')        AS count_12_24m,
  COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_gt_24m')        AS count_gt_24m,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE sws.eba_status_category = 'no_eba_no_bargaining') * 100.0 / COUNT(*), 1)
    ELSE 0 END AS pct_no_eba,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE sws.eba_status_category = 'first_bargaining') * 100.0 / COUNT(*), 1)
    ELSE 0 END AS pct_first_bargaining,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE sws.eba_status_category = 'expired_eba') * 100.0 / COUNT(*), 1)
    ELSE 0 END AS pct_expired,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_lt_6m') * 100.0 / COUNT(*), 1)
    ELSE 0 END AS pct_lt_6m,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_6_12m') * 100.0 / COUNT(*), 1)
    ELSE 0 END AS pct_6_12m,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_12_24m') * 100.0 / COUNT(*), 1)
    ELSE 0 END AS pct_12_24m,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE sws.eba_status_category = 'expiry_gt_24m') * 100.0 / COUNT(*), 1)
    ELSE 0 END AS pct_gt_24m
FROM employers pe
JOIN scope_with_status sws ON sws.pe_id = pe.employer_id
WHERE pe.employer_category = 'Principal_Employer'
GROUP BY pe.employer_id, pe.employer_name;
