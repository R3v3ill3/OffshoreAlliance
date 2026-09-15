-- Campaign 42 employer-mismatch diagnostic (read-only).
-- Session-local temp tables only. Does not change application data.
--
-- Question: which members of campaign 42 have a global employer that is not
-- the campaign's declared employer (EDI / Downer / Chevron), and how did
-- they get onto a Wheatstone / Gorgon unit?
--
-- Membership uses OR (employer in campaign_employers OR worksite in
-- campaign_worksites). Unit auto-match uses AND on present unit_basis keys
-- (WP2.1 F1). Sync is additive; hygiene never withdrew these rows.

BEGIN;

-- Change this to reuse the report for another campaign.
DO $params$
BEGIN
  PERFORM set_config('oux.diag_campaign_id', '42', true);
END;
$params$;

CREATE TEMP TABLE _diag_campaign ON COMMIT DROP AS
SELECT
  c.campaign_id,
  c.name AS campaign_name,
  c.status,
  c.is_standing,
  c.is_sms_episode,
  o.organiser_name AS campaign_organiser
FROM public.campaigns AS c
LEFT JOIN public.organisers AS o ON o.organiser_id = c.organiser_id
WHERE c.campaign_id = current_setting('oux.diag_campaign_id')::integer;

DO $exists$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _diag_campaign) THEN
    RAISE EXCEPTION 'campaign % does not exist',
      current_setting('oux.diag_campaign_id');
  END IF;
END;
$exists$;

CREATE TEMP TABLE _diag_campaign_employers ON COMMIT DROP AS
SELECT
  e.employer_id,
  e.employer_name
FROM public.campaign_employers AS ce
JOIN public.employers AS e ON e.employer_id = ce.employer_id
WHERE ce.campaign_id = current_setting('oux.diag_campaign_id')::integer;

CREATE TEMP TABLE _diag_campaign_worksites ON COMMIT DROP AS
SELECT
  ws.worksite_id,
  ws.worksite_name,
  cw.sector_wide
FROM public.campaign_worksites AS cw
LEFT JOIN public.worksites AS ws ON ws.worksite_id = cw.worksite_id
WHERE cw.campaign_id = current_setting('oux.diag_campaign_id')::integer;

-- Name-pattern fallback when campaign_employers is empty or incomplete.
-- "EDI Downer Chevron" is treated as any employer whose name contains
-- edi / downer / chevron (case-insensitive). Tighten this list after
-- result set 1 shows the exact campaign_employers rows.
CREATE TEMP TABLE _diag_expected_employer_ids ON COMMIT DROP AS
SELECT employer_id
FROM _diag_campaign_employers
UNION
SELECT e.employer_id
FROM public.employers AS e
WHERE e.employer_name ~* '(edi|downer)'
   OR e.employer_name ~* 'chevron';

CREATE TEMP TABLE _diag_units ON COMMIT DROP AS
SELECT
  cou.ou_id,
  cou.name AS unit_name,
  cou.ou_type,
  cou.parent_ou_id,
  cou.ou_group_id,
  cou.is_group_container,
  cou.unit_basis,
  CASE
    WHEN (cou.unit_basis ->> 'employer_id') ~ '^[0-9]+$'
      AND (cou.unit_basis ->> 'employer_id')::numeric BETWEEN 1 AND 2147483647
      THEN (cou.unit_basis ->> 'employer_id')::integer
  END AS basis_employer_id,
  CASE
    WHEN (cou.unit_basis ->> 'worksite_id') ~ '^[0-9]+$'
      AND (cou.unit_basis ->> 'worksite_id')::numeric BETWEEN 1 AND 2147483647
      THEN (cou.unit_basis ->> 'worksite_id')::integer
  END AS basis_worksite_id,
  (cou.unit_basis -> 'auto_match') IS DISTINCT FROM 'false'::jsonb AS auto_match_enabled
FROM public.campaign_organising_units AS cou
WHERE cou.campaign_id = current_setting('oux.diag_campaign_id')::integer;

CREATE TEMP TABLE _diag_members ON COMMIT DROP AS
SELECT
  cwm.membership_id,
  cwm.worker_id,
  cwm.created_at AS membership_created_at,
  w.first_name,
  w.last_name,
  w.is_active,
  w.employer_id,
  e.employer_name,
  w.worksite_id,
  ws.worksite_name,
  (w.employer_id IS NOT NULL
    AND w.employer_id IN (SELECT employer_id FROM _diag_campaign_employers)) AS employer_in_campaign_universe,
  (w.employer_id IS NOT NULL
    AND w.employer_id IN (SELECT employer_id FROM _diag_expected_employer_ids)) AS employer_matches_name_pattern,
  (w.worksite_id IS NOT NULL
    AND w.worksite_id IN (
      SELECT worksite_id FROM _diag_campaign_worksites WHERE worksite_id IS NOT NULL
    )) AS worksite_in_campaign_universe
FROM public.campaign_worker_membership AS cwm
JOIN public.workers AS w ON w.worker_id = cwm.worker_id
LEFT JOIN public.employers AS e ON e.employer_id = w.employer_id
LEFT JOIN public.worksites AS ws ON ws.worksite_id = w.worksite_id
WHERE cwm.campaign_id = current_setting('oux.diag_campaign_id')::integer;

CREATE TEMP TABLE _diag_placements ON COMMIT DROP AS
SELECT
  cwo.id AS placement_id,
  cwo.worker_id,
  cwo.ou_id,
  u.unit_name,
  u.ou_type,
  u.is_group_container,
  u.basis_employer_id,
  u.basis_worksite_id,
  u.auto_match_enabled,
  be.employer_name AS basis_employer_name,
  bws.worksite_name AS basis_worksite_name,
  cwo.assignment_source,
  cwo.assigned_rule_id,
  cwo.is_primary,
  cwo.created_at AS placement_created_at,
  w.employer_id AS worker_employer_id,
  w.worksite_id AS worker_worksite_id,
  u.auto_match_enabled
    AND (u.basis_employer_id IS NOT NULL OR u.basis_worksite_id IS NOT NULL)
    AND (u.basis_employer_id IS NULL OR u.basis_employer_id = w.employer_id)
    AND (u.basis_worksite_id IS NULL OR u.basis_worksite_id = w.worksite_id)
    AS current_f1_would_match,
  (u.basis_employer_id IS NOT NULL AND u.basis_employer_id IS DISTINCT FROM w.employer_id)
    AS unit_employer_disagrees,
  (u.basis_worksite_id IS NOT NULL AND u.basis_worksite_id IS NOT DISTINCT FROM w.worksite_id)
    AS unit_worksite_agrees
FROM public.campaign_worker_ou AS cwo
JOIN _diag_units AS u ON u.ou_id = cwo.ou_id
JOIN public.workers AS w ON w.worker_id = cwo.worker_id
LEFT JOIN public.employers AS be ON be.employer_id = u.basis_employer_id
LEFT JOIN public.worksites AS bws ON bws.worksite_id = u.basis_worksite_id;

-- ---------------------------------------------------------------------------
-- 1. Campaign 42 universe (employers, worksites, organisers, unit shape)
-- ---------------------------------------------------------------------------
SELECT
  '1_campaign' AS result_set,
  dc.campaign_id,
  dc.campaign_name,
  dc.status,
  dc.campaign_organiser,
  (SELECT count(*) FROM _diag_campaign_employers) AS campaign_employer_count,
  (SELECT count(*) FROM _diag_campaign_worksites) AS campaign_worksite_count,
  (SELECT count(*) FROM _diag_units) AS unit_count,
  (SELECT count(*) FROM _diag_members) AS member_count,
  (SELECT count(*) FROM _diag_placements) AS placement_count
FROM _diag_campaign AS dc;

SELECT
  '1b_campaign_employers' AS result_set,
  employer_id,
  employer_name
FROM _diag_campaign_employers
ORDER BY employer_name;

SELECT
  '1c_campaign_worksites' AS result_set,
  worksite_id,
  worksite_name,
  sector_wide
FROM _diag_campaign_worksites
ORDER BY worksite_name NULLS LAST;

SELECT
  '1d_campaign_organisers' AS result_set,
  o.organiser_id,
  o.organiser_name,
  co.campaign_role
FROM public.campaign_organisers AS co
JOIN public.organisers AS o ON o.organiser_id = co.organiser_id
WHERE co.campaign_id = current_setting('oux.diag_campaign_id')::integer
ORDER BY o.organiser_name;

SELECT
  '1e_units' AS result_set,
  u.ou_id,
  u.unit_name,
  u.ou_type,
  u.parent_ou_id,
  u.is_group_container,
  u.basis_employer_id,
  be.employer_name AS basis_employer_name,
  u.basis_worksite_id,
  bws.worksite_name AS basis_worksite_name,
  u.auto_match_enabled,
  (SELECT count(*) FROM _diag_placements AS p WHERE p.ou_id = u.ou_id) AS workers_on_unit
FROM _diag_units AS u
LEFT JOIN public.employers AS be ON be.employer_id = u.basis_employer_id
LEFT JOIN public.worksites AS bws ON bws.worksite_id = u.basis_worksite_id
ORDER BY u.ou_type, u.unit_name, u.ou_id;

-- ---------------------------------------------------------------------------
-- 2. Brendon Annad (example). Name search is loose for Annad / Annand.
-- ---------------------------------------------------------------------------
SELECT
  '2_brendon_annad' AS result_set,
  m.worker_id,
  m.first_name,
  m.last_name,
  m.is_active,
  m.employer_id,
  m.employer_name,
  m.worksite_id,
  m.worksite_name,
  m.membership_created_at,
  m.employer_in_campaign_universe,
  m.worksite_in_campaign_universe,
  p.placement_id,
  p.ou_id,
  p.unit_name,
  p.ou_type,
  p.assignment_source,
  p.placement_created_at,
  p.basis_employer_id,
  p.basis_employer_name,
  p.basis_worksite_id,
  p.basis_worksite_name,
  p.current_f1_would_match,
  p.unit_employer_disagrees
FROM _diag_members AS m
LEFT JOIN _diag_placements AS p ON p.worker_id = m.worker_id
WHERE m.first_name ILIKE 'brendon%'
  AND m.last_name ILIKE 'anna%'
ORDER BY m.worker_id, p.ou_id;

-- ---------------------------------------------------------------------------
-- 3. Members whose employer is not in campaign_employers
--    (primary definition of "wrong employer for this campaign")
-- ---------------------------------------------------------------------------
SELECT
  '3_members_employer_not_in_campaign_employers' AS result_set,
  m.worker_id,
  m.first_name,
  m.last_name,
  m.is_active,
  m.employer_id,
  m.employer_name,
  m.worksite_id,
  m.worksite_name,
  m.membership_created_at,
  m.worksite_in_campaign_universe,
  CASE
    WHEN m.worksite_in_campaign_universe THEN 'worksite_or_match'
    WHEN m.employer_id IS NULL THEN 'no_employer_no_worksite_match'
    ELSE 'neither_universe_key'
  END AS how_they_qualify_under_or_sync,
  coalesce(p.unit_names, '(unassigned)') AS units,
  coalesce(p.assignment_sources, '') AS assignment_sources,
  coalesce(p.f1_match_flags, '') AS current_f1_would_match,
  coalesce(p.unit_employer_disagree_count, 0) AS units_whose_basis_employer_differs
FROM _diag_members AS m
LEFT JOIN LATERAL (
  SELECT
    string_agg(p.unit_name, ' | ' ORDER BY p.ou_id) AS unit_names,
    string_agg(p.assignment_source, ',' ORDER BY p.ou_id) AS assignment_sources,
    string_agg(p.current_f1_would_match::text, ',' ORDER BY p.ou_id) AS f1_match_flags,
    count(*) FILTER (WHERE p.unit_employer_disagrees) AS unit_employer_disagree_count
  FROM _diag_placements AS p
  WHERE p.worker_id = m.worker_id
) AS p ON true
WHERE m.employer_in_campaign_universe IS NOT TRUE
ORDER BY m.employer_name NULLS FIRST, m.worksite_name NULLS FIRST, m.last_name, m.first_name;

-- ---------------------------------------------------------------------------
-- 4. Same list, name-pattern definition: employer is not EDI / Downer / Chevron
--    Use this when the user asked specifically for "not EDI Downer Chevron".
-- ---------------------------------------------------------------------------
SELECT
  '4_members_employer_not_edi_downer_chevron' AS result_set,
  m.worker_id,
  m.first_name,
  m.last_name,
  m.is_active,
  m.employer_id,
  m.employer_name,
  m.worksite_id,
  m.worksite_name,
  m.membership_created_at,
  m.employer_in_campaign_universe,
  m.worksite_in_campaign_universe,
  coalesce(p.unit_names, '(unassigned)') AS units,
  coalesce(p.assignment_sources, '') AS assignment_sources
FROM _diag_members AS m
LEFT JOIN LATERAL (
  SELECT string_agg(p.unit_name, ' | ' ORDER BY p.ou_id) AS unit_names,
         string_agg(p.assignment_source, ',' ORDER BY p.ou_id) AS assignment_sources
  FROM _diag_placements AS p
  WHERE p.worker_id = m.worker_id
) AS p ON true
WHERE m.employer_matches_name_pattern IS NOT TRUE
ORDER BY m.employer_name NULLS FIRST, m.worksite_name NULLS FIRST, m.last_name, m.first_name;

-- ---------------------------------------------------------------------------
-- 5. Placements that would not be written by today's F1 matcher
--    (stale / pre-F1 OR / worksite-only leftover / employer changed later)
-- ---------------------------------------------------------------------------
SELECT
  '5_stale_or_wrong_employer_placements' AS result_set,
  p.placement_id,
  p.worker_id,
  m.first_name,
  m.last_name,
  m.employer_name AS worker_employer,
  m.worksite_name AS worker_worksite,
  p.ou_id,
  p.unit_name,
  p.ou_type,
  p.basis_employer_name,
  p.basis_worksite_name,
  p.assignment_source,
  p.placement_created_at,
  p.current_f1_would_match,
  p.unit_employer_disagrees,
  p.unit_worksite_agrees
FROM _diag_placements AS p
JOIN _diag_members AS m ON m.worker_id = p.worker_id
WHERE p.current_f1_would_match IS NOT TRUE
   OR p.unit_employer_disagrees
   OR m.employer_in_campaign_universe IS NOT TRUE
ORDER BY p.unit_name, m.last_name, m.first_name, p.placement_id;

-- ---------------------------------------------------------------------------
-- 6. Histograms — is this a handful of relics or the OR-sync filling the chart?
-- ---------------------------------------------------------------------------
SELECT
  '6a_mismatch_by_employer' AS result_set,
  coalesce(m.employer_name, '(no employer)') AS employer_name,
  count(*) AS members,
  count(*) FILTER (WHERE m.worksite_in_campaign_universe) AS worksite_also_in_universe,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM _diag_placements AS p WHERE p.worker_id = m.worker_id
  )) AS on_a_unit
FROM _diag_members AS m
WHERE m.employer_in_campaign_universe IS NOT TRUE
GROUP BY m.employer_name
ORDER BY members DESC, employer_name;

SELECT
  '6b_mismatch_by_worksite' AS result_set,
  coalesce(m.worksite_name, '(no worksite)') AS worksite_name,
  count(*) AS members
FROM _diag_members AS m
WHERE m.employer_in_campaign_universe IS NOT TRUE
GROUP BY m.worksite_name
ORDER BY members DESC, worksite_name;

SELECT
  '6c_mismatch_by_assignment_source' AS result_set,
  coalesce(p.assignment_source, '(unassigned)') AS assignment_source,
  count(DISTINCT m.worker_id) AS members,
  count(p.placement_id) AS placements
FROM _diag_members AS m
LEFT JOIN _diag_placements AS p ON p.worker_id = m.worker_id
WHERE m.employer_in_campaign_universe IS NOT TRUE
GROUP BY p.assignment_source
ORDER BY members DESC;

SELECT
  '6d_membership_qualification' AS result_set,
  count(*) AS members,
  count(*) FILTER (WHERE m.employer_in_campaign_universe) AS employer_in_universe,
  count(*) FILTER (WHERE m.worksite_in_campaign_universe) AS worksite_in_universe,
  count(*) FILTER (
    WHERE m.employer_in_campaign_universe AND m.worksite_in_campaign_universe
  ) AS both_keys,
  count(*) FILTER (
    WHERE NOT m.employer_in_campaign_universe AND m.worksite_in_campaign_universe
  ) AS worksite_only_or_match,
  count(*) FILTER (
    WHERE m.employer_in_campaign_universe AND NOT m.worksite_in_campaign_universe
  ) AS employer_only_or_match,
  count(*) FILTER (
    WHERE NOT m.employer_in_campaign_universe AND NOT m.worksite_in_campaign_universe
  ) AS neither_key_manual_or_stale,
  count(*) FILTER (WHERE NOT m.employer_matches_name_pattern) AS not_edi_downer_chevron_name
FROM _diag_members AS m;

-- ---------------------------------------------------------------------------
-- 7. Same OR-membership pattern on every live campaign (systemic check)
-- ---------------------------------------------------------------------------
SELECT
  '7_other_campaigns_worksite_only_or_members' AS result_set,
  c.campaign_id,
  c.name AS campaign_name,
  count(DISTINCT cwm.worker_id) AS members,
  count(DISTINCT cwm.worker_id) FILTER (
    WHERE w.employer_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.campaign_employers AS ce
         WHERE ce.campaign_id = c.campaign_id
           AND ce.employer_id = w.employer_id
       )
  ) AS members_employer_not_in_campaign_employers,
  count(DISTINCT cwm.worker_id) FILTER (
    WHERE (
      w.employer_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.campaign_employers AS ce
        WHERE ce.campaign_id = c.campaign_id
          AND ce.employer_id = w.employer_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.campaign_worksites AS cw
      WHERE cw.campaign_id = c.campaign_id
        AND cw.worksite_id = w.worksite_id
    )
  ) AS of_those_worksite_or_match
FROM public.campaigns AS c
JOIN public.campaign_worker_membership AS cwm ON cwm.campaign_id = c.campaign_id
JOIN public.workers AS w ON w.worker_id = cwm.worker_id
WHERE c.status IN ('planning', 'active')
  AND c.is_sms_episode IS DISTINCT FROM true
GROUP BY c.campaign_id, c.name
HAVING count(DISTINCT cwm.worker_id) FILTER (
  WHERE w.employer_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.campaign_employers AS ce
       WHERE ce.campaign_id = c.campaign_id
         AND ce.employer_id = w.employer_id
     )
) > 0
ORDER BY members_employer_not_in_campaign_employers DESC, c.campaign_id;

COMMIT;
