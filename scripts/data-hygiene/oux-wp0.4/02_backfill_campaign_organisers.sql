-- ---------------------------------------------------------------------------------------------
-- WP0.4 data hygiene -- script 02: backfill campaign_organisers from campaigns.organiser_id (campaign_role='lead')
-- Operator-run SQL. NOT a migration: never place under supabase/migrations/, never `supabase db push`.
--
-- RUN ORDER:  00_create_hygiene_log  ->  02_backfill_campaign_organisers  ->  03_resolve_duplicate_placements
--             ->  01_role_conversion
-- HOLD:       01_role_conversion is HELD until WP1.6 is on production (wp0.4.md 3.5, 11). This script (02) MUST
--             run before 01: its 'lead' roster rows are what keep the converted accounts' campaign-level write
--             access via is_lead_organiser_for_campaign() arm 2 (wp0.4.md 3.6).
--
-- Run as postgres (Supabase SQL editor for the target project, or interactive psql with ON_ERROR_STOP). One file at
-- a time, in THREE SEPARATE SUBMISSIONS: BLOCK 1 PRE-CHECK -> inspect every result -> BLOCK 2 CHANGE -> BLOCK 3
-- POST-CHECK. The SQL editor returns only ONE result set per submission (the last statement's), so a pre-check
-- pasted together with the change is never seen. Under interactive psql a failed CHANGE leaves the session in an
-- aborted transaction: run ROLLBACK; before anything else.
-- Requires: public._oux_hygiene_log (00_create_hygiene_log.sql).
-- Idempotent: ON CONFLICT (campaign_id, organiser_id) DO NOTHING on the UNIQUE constraint
--             campaign_organisers_campaign_id_organiser_id_key (baseline_schema.sql:19026); re-running inserts 0, logs 0.
-- Selector: campaigns.organiser_id IS NOT NULL AND is_sms_episode = false AND is_standing = false.
--           No campaign id or organiser id is hard-coded.
-- Plan: docs/organiser-ux-review/wp/wp0.4.md 4
-- ---------------------------------------------------------------------------------------------

-- ##########################################  BLOCK 1 of 3  ###########################################
-- ============ PRE-CHECK (read-only; paste the output into wp/wp0.4.md) ============
-- Submit this block ON ITS OWN (from here to END OF BLOCK 1). Inspect every result before submitting block 2.

-- Diagnostic: how the 22 campaigns break down. Expected (G.1, G.3): total 22, sms_episodes 0, standing 1,
-- with_organiser 21 (appendix G.6: 7+6+4+2+1+1, plus 1 unassigned).
SELECT count(*)                                                        AS campaigns_total,
       count(*) FILTER (WHERE is_sms_episode)                          AS sms_episodes,
       count(*) FILTER (WHERE is_standing)                             AS standing,
       count(*) FILTER (WHERE organiser_id IS NOT NULL)                AS with_organiser,
       count(*) FILTER (WHERE organiser_id IS NOT NULL
                          AND is_standing AND NOT is_sms_episode)      AS standing_with_organiser
FROM public.campaigns;

-- THE number the change must produce. Expected 21 if the standing campaign is the unassigned one,
-- 20 if the standing campaign carries an organiser_id (wp0.4.md open question 2). Do not assume: record the value.
SELECT count(*) AS expected_inserts
FROM public.campaigns c
WHERE c.organiser_id IS NOT NULL
  AND c.is_sms_episode = false
  AND c.is_standing    = false
  AND NOT EXISTS (SELECT 1 FROM public.campaign_organisers co
                   WHERE co.campaign_id = c.campaign_id AND co.organiser_id = c.organiser_id);

-- Expected (G.1): 0 rows in the table today.
SELECT count(*) AS campaign_organisers_before FROM public.campaign_organisers;

-- Expected: 0 rows. Any campaign that already has a 'lead' other than campaigns.organiser_id
-- must be looked at by hand before running the change.
SELECT co.campaign_id, co.organiser_id, c.organiser_id AS campaign_organiser_id
FROM public.campaign_organisers co JOIN public.campaigns c USING (campaign_id)
WHERE co.campaign_role = 'lead' AND co.organiser_id IS DISTINCT FROM c.organiser_id;

-- Expected: 0 rows. campaigns.organiser_id pointing at an organiser that no longer exists would break the FK.
SELECT c.campaign_id FROM public.campaigns c
LEFT JOIN public.organisers o ON o.organiser_id = c.organiser_id
WHERE c.organiser_id IS NOT NULL AND o.organiser_id IS NULL;

-- Stop if any pre-check disagrees with its expected value.
-- ########################################  END OF BLOCK 1  ###########################################

-- ##########################################  BLOCK 2 of 3  ###########################################
-- ============ CHANGE ============
-- Submit this block ON ITS OWN (BEGIN; ... COMMIT;). Under psql, if it errors, run ROLLBACK; before anything else.
BEGIN;
WITH ins AS (
  INSERT INTO public.campaign_organisers (campaign_id, organiser_id, campaign_role, reports_to_organiser_id)
  SELECT c.campaign_id, c.organiser_id, 'lead', NULL
  FROM public.campaigns c
  WHERE c.organiser_id IS NOT NULL
    AND c.is_sms_episode = false
    AND c.is_standing    = false
  ON CONFLICT (campaign_id, organiser_id) DO NOTHING
  RETURNING id, campaign_id, organiser_id, campaign_role, added_at
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '02_backfill_campaign_organisers', 'insert', 'public.campaign_organisers',
       jsonb_build_object('id', id),
       NULL,
       jsonb_build_object('campaign_id', campaign_id, 'organiser_id', organiser_id,
                          'campaign_role', campaign_role, 'added_at', added_at),
       'backfilled from campaigns.organiser_id'
FROM ins;
COMMIT;
-- ########################################  END OF BLOCK 2  ###########################################

-- ##########################################  BLOCK 3 of 3  ###########################################
-- ============ POST-CHECK (read-only) ============
-- Submit this block ON ITS OWN.

-- Expected: 0
SELECT count(*) AS still_missing
FROM public.campaigns c
WHERE c.organiser_id IS NOT NULL AND c.is_sms_episode = false AND c.is_standing = false
  AND NOT EXISTS (SELECT 1 FROM public.campaign_organisers co
                   WHERE co.campaign_id = c.campaign_id AND co.organiser_id = c.organiser_id);

-- Expected: equals the pre-check expected_inserts (21 on production, subject to open question 2)
SELECT count(*) AS campaign_organisers_after FROM public.campaign_organisers;
SELECT count(*) AS logged FROM public._oux_hygiene_log
WHERE script='02_backfill_campaign_organisers' AND rolled_back_at IS NULL;

-- INVARIANT: at most one 'lead' per campaign. Expected: 0 rows.
SELECT campaign_id, count(*) FROM public.campaign_organisers
WHERE campaign_role='lead' GROUP BY 1 HAVING count(*) > 1;

-- INVARIANT (8.2 #12): every roster row's organiser matches campaigns.organiser_id. Expected: 0 rows.
-- VALID IMMEDIATELY AFTER 02 ONLY: the roster UI legitimately adds campaign_role='organiser' members later, and
-- those rows are supposed to differ from campaigns.organiser_id. Non-zero at a later date is not a failure.
SELECT co.campaign_id FROM public.campaign_organisers co
JOIN public.campaigns c USING (campaign_id)
WHERE co.organiser_id IS DISTINCT FROM c.organiser_id;

-- Distribution (8.2 #13), for the WP1.3 "My campaigns" baseline. Expected: 6 organisers with 7,6,4,2,1,1 campaigns.
-- VALID IMMEDIATELY AFTER 02 ONLY, for the same reason as #12.
SELECT organiser_id, count(*) FROM public.campaign_organisers GROUP BY 1 ORDER BY 2 DESC;

-- Rollback: run 02_rollback.sql
