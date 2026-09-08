-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 90: READ-ONLY verification suite (run before, after, and at any later date)
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER:  90 (before snapshot)  ->  00_create_hygiene_log  ->  02_backfill_campaign_organisers
--             ->  03_resolve_duplicate_placements  ->  01_role_conversion  ->  90 + 91 (after snapshot)
-- HOLD:       01_role_conversion is HELD until WP1.6 is on production (wp0.4.md 3.5, 11). 02 must run before 01.
--
-- This file changes nothing and touches NO audit table: every query is a plain SELECT on application tables, so
-- it runs identically before 00_create_hygiene_log and after 99_drop_hygiene_log. The audit-log invariants
-- (#3, #27, logged counts) are in 91_verify_log.sql; run that one only while public._oux_hygiene_log exists.
-- Every query is labelled with its expected PRODUCTION value and the wp0.4.md 8.2 assertion number (#n).
-- H1, H3, H5, H6, H7 are verbatim from appendix C 8.4 (appendix-C-data-model.md), wrapped in count(*) where the
-- verbatim query returns rows rather than a count. In the SQL editor each statement is one submission if you want
-- to see every result (the editor shows only the last result set of a multi-statement submission).
-- Paste the whole output into docs/organiser-ux-review/wp/wp0.4.md 13.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 8
-- ---------------------------------------------------------------------------------------------

-- ============ A. Hazard queries, verbatim from appendix C 8.4 ============

-- H1. Workers in >1 unit of the SAME group (would violate one-per-group)
-- #15 expected 2 before 03; #21 expected 0 after 03; #28 back to 2 after 03_rollback
SELECT count(*) AS h1_pairs FROM (
  SELECT cou.campaign_id, cou.ou_group_id, cwo.worker_id, COUNT(*) AS units
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

-- H3. Workers in >1 STANDALONE unit of the same ou_type (no group today, so no rule applied)
-- #16 expected 5 before 03; #22 expected 0 after 03; #28 back to 5 after 03_rollback
SELECT count(*) AS h3_pairs FROM (
  SELECT cou.campaign_id, cou.ou_type, cwo.worker_id, COUNT(*)
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

-- H5. campaign_worker_ou rows whose worker is NOT a member of the unit's campaign (invisible to Unallocated logic)
-- #24 expected 0 before and after 03 (the verbatim query is already a count; not re-wrapped)
SELECT COUNT(*) AS h5_placements_without_membership FROM campaign_worker_ou cwo
JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
LEFT JOIN campaign_worker_membership m ON m.campaign_id = cou.campaign_id AND m.worker_id = cwo.worker_id
WHERE m.membership_id IS NULL;

-- H6. Members with no unit at all (today's campaign-wide Unallocated)
-- #29 expected: h6_members_with_no_unit = 1162 before AND after 03 (03 must not change it). The verbatim query
-- returns one row per campaign; count(*) gives the number of campaigns with unallocated members and sum(count)
-- the total members with no unit, which is the G.5 figure.
SELECT count(*) AS h6_campaigns_with_unallocated, coalesce(sum(x.count), 0) AS h6_members_with_no_unit FROM (
  SELECT m.campaign_id, COUNT(*) FROM campaign_worker_membership m
  WHERE NOT EXISTS (SELECT 1 FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
                    WHERE cou.campaign_id = m.campaign_id AND cwo.worker_id = m.worker_id)
  GROUP BY 1) x;

-- H7. Multiple is_primary per worker per campaign
-- #23 expected 0 before and after 03
SELECT count(*) AS h7_multi_primary FROM (
  SELECT cou.campaign_id, cwo.worker_id, COUNT(*) FROM campaign_worker_ou cwo
  JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cwo.is_primary GROUP BY 1,2 HAVING COUNT(*) > 1) x;

-- ============ B. Script 01 material (user_profiles) ============

-- #1 expected 7 before 01; #2 expected 0 after 01; #6 back to 7 after 01_rollback
SELECT count(*) AS admin_organisers
FROM public.user_profiles
WHERE role = 'admin' AND work_role = 'organiser';

-- #4 expected 4 after 01 (2 lead_organiser, 1 coordinator, 1 industrial_coordinator); 11 before 01
SELECT count(*) AS admins_total
FROM public.user_profiles
WHERE role = 'admin';

-- #5 expected 8 after 01 (7 converted + 1 existing); 1 before 01
SELECT count(*) AS user_organisers
FROM public.user_profiles
WHERE role = 'user' AND work_role = 'organiser';

-- Full distribution (G.6). Before 01: admin/organiser 7, admin/lead_organiser 2, admin/coordinator 1,
-- admin/industrial_coordinator 1, user/organiser 1, user/industrial_officer 1 (13 rows).
-- After 01: admin/coordinator 1, admin/industrial_coordinator 1, admin/lead_organiser 2, user/industrial_officer 1,
-- user/organiser 8.
SELECT role, work_role, count(*)
FROM public.user_profiles GROUP BY 1,2 ORDER BY 1,2;

-- ============ C. Script 02 material (campaign_organisers) ============

-- #7 expected 0 before 02; #9 expected = #8 (21, or 20 -- see wp0.4.md open question 2) after 02;
-- #14 expected 0 after 02_rollback
SELECT count(*) AS campaign_organisers_rows FROM public.campaign_organisers;

-- #8 expected 21 (or 20 if the standing campaign carries an organiser_id) before 02; #10 expected 0 after 02
SELECT count(*) AS campaigns_needing_roster_row
FROM public.campaigns c
WHERE c.organiser_id IS NOT NULL
  AND c.is_sms_episode = false
  AND c.is_standing    = false
  AND NOT EXISTS (SELECT 1 FROM public.campaign_organisers co
                   WHERE co.campaign_id = c.campaign_id AND co.organiser_id = c.organiser_id);

-- Campaign breakdown (G.1, G.3): total 22, sms_episodes 0, standing 1, with_organiser 21
SELECT count(*)                                                        AS campaigns_total,
       count(*) FILTER (WHERE is_sms_episode)                          AS sms_episodes,
       count(*) FILTER (WHERE is_standing)                             AS standing,
       count(*) FILTER (WHERE organiser_id IS NOT NULL)                AS with_organiser,
       count(*) FILTER (WHERE organiser_id IS NOT NULL
                          AND is_standing AND NOT is_sms_episode)      AS standing_with_organiser
FROM public.campaigns;

-- #11 INVARIANT: at most one 'lead' per campaign. Expected: 0 rows (before and after)
SELECT campaign_id, count(*) AS leads FROM public.campaign_organisers
WHERE campaign_role='lead' GROUP BY 1 HAVING count(*) > 1;

-- #12 INVARIANT: every roster row's organiser matches campaigns.organiser_id. Expected: 0 rows before 02 and
-- IMMEDIATELY AFTER 02 ONLY. The roster UI legitimately adds campaign_role='organiser' members later, and those
-- rows differ from campaigns.organiser_id by design; non-zero in a later snapshot is not a failure.
SELECT co.campaign_id FROM public.campaign_organisers co
JOIN public.campaigns c USING (campaign_id)
WHERE co.organiser_id IS DISTINCT FROM c.organiser_id;

-- #13 Campaigns per organiser. Expected IMMEDIATELY AFTER 02 ONLY: 6 organisers with 7, 6, 4, 2, 1, 1; no rows
-- before 02. Later snapshots include roster members added through the UI (same caveat as #12).
SELECT organiser_id, count(*) AS campaigns FROM public.campaign_organisers GROUP BY 1 ORDER BY 2 DESC, 1;

-- ============ D. Script 03 material (campaign_worker_ou / campaign_worker_membership) ============

-- #17 rows 03 would delete, by hazard / campaign / assignment_source. Expected before 03: 7 in total if every
-- pair has exactly two placements (G.3 "Same-type dupes": 57->2, 64->3, 42->2) -- recorded, not assumed;
-- after 03: no rows. #18: NO row may have assignment_source = 'rule' (non-zero stops the run; wp0.4.md 5.2).
WITH keyed AS (
  SELECT cwo.id, cwo.worker_id, cwo.is_primary, cwo.assignment_source, cwo.created_at,
         cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'H1' ELSE 'H3' END AS hazard,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k.campaign_id, k.dim_key, k.worker_id
                                 ORDER BY k.is_primary DESC, k.created_at DESC, k.id DESC) AS rn
  FROM keyed k
)
SELECT hazard, campaign_id, assignment_source, count(*) AS rows_to_delete
FROM ranked WHERE rn > 1 GROUP BY 1,2,3 ORDER BY 1,2,3;

-- #17 total / #18 rule-sourced total. Expected before 03: 7 / 0; after 03: 0 / 0
WITH keyed AS (
  SELECT cwo.id, cwo.worker_id, cwo.is_primary, cwo.assignment_source, cwo.created_at,
         cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k.campaign_id, k.dim_key, k.worker_id
                                 ORDER BY k.is_primary DESC, k.created_at DESC, k.id DESC) AS rn
  FROM keyed k
)
SELECT count(*)                                              AS rows_to_delete_total,
       count(*) FILTER (WHERE assignment_source = 'rule')    AS rows_to_delete_rule_sourced
FROM ranked WHERE rn > 1;

-- #19 expected 1614 before 03; #20 expected 1614 - #17 (1607 if #17 = 7) after 03; #28 back to 1614 after 03_rollback
SELECT count(*) AS worker_ou_rows FROM public.campaign_worker_ou;

-- #25 INVARIANT: expected 2670 before AND after 03 (the headline invariant)
SELECT count(*) AS membership_rows FROM public.campaign_worker_membership;

-- #26 INVARIANT: members in >= 1 unit, per campaign. Expected identical before and after 03:
-- 57 -> 303, 64 -> 267, 42 -> 202, everything else unchanged
SELECT cou.campaign_id, count(DISTINCT cwo.worker_id) AS members_in_a_unit
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
GROUP BY 1 ORDER BY 1;

-- ============ E. Audit-log invariants: moved to 91_verify_log.sql ============
-- #3, #27 and the per-script logged counts read public._oux_hygiene_log, which exists only between 00 and 99.
-- This file must run before 00 and after 99 without error, so those queries live in 91_verify_log.sql (plain
-- SELECTs; run it only while the log table exists). The same counts appear in the 01/02/03 post-checks.

-- End of 90_verify_all.sql (read-only; nothing to roll back)
