-- WP3.8 acceptance item 4 — read-only simulation (docs/organiser-ux-review/wp/wp3.8.md §5.3).
-- Runs on the realistic data set through the connector (read is free). No
-- write, no transaction control, no session setting, no environment marker;
-- aggregates only. It runs BEFORE the migration exists as well as after: it
-- references neither parent_campaign_id, nor scope, nor
-- campaign_family_activity_ids() — the family (61 → 64, 62 → 64) and the one
-- family activity (88, the operator's first sector-wide assessment) are
-- simulated with VALUES.
--
-- It recomputes campaign_worker_rating_summary under the §3.3 rule ("owned by
-- this campaign, or owned by my parent with scope = family") for 61, 62 and 64
-- and compares row by row with the live view:
--   members                          rows of the live view for the campaign
--   rows_changed                     cumulative_rating or supportive_activity_count differs
--   rows_changed_shared_with_parent  … and the worker is also a member of 64
--   rows_changed_rated_on_88         … and the worker holds a rating on 88
-- Acceptance shape (planning-time run, 2026-09-17): 61 → 48 members, 2 changed,
-- 2 shared, 2 rated on 88; 62 → 64 members, 13 / 13 / 13; 64 → 276 members,
-- 0 changed. Child summaries change only for shared workers who hold a rating
-- on the family activity; the parent's counts are unchanged.
--
-- The wb and ra CTEs are the view's worker_base_rating and rating_activity
-- (wp3.8.md §3.3) verbatim, ra without the campaign join column; `simulated`
-- computes cumulative_rating and supportive_activity_count exactly as the view.

WITH family AS (SELECT * FROM (VALUES (61, 64), (62, 64)) AS f(child_id, parent_id)),
     family_flag AS (SELECT 88 AS activity_id),
     fam_ids AS (
       SELECT c.campaign_id AS viewing_id, a.activity_id
       FROM public.campaigns c JOIN public.campaign_activities a ON a.campaign_id = c.campaign_id
       UNION
       SELECT f.child_id, a.activity_id
       FROM family f JOIN public.campaign_activities a ON a.campaign_id = f.parent_id
       JOIN family_flag ff ON ff.activity_id = a.activity_id),
     wb AS (
       SELECT m_1.campaign_id, m_1.worker_id,
         CASE
           WHEN lower(mrt.role_name::text) = ANY (ARRAY['contact'::text, 'activist'::text, 'delegate'::text]) THEN 1
           WHEN w.is_bargaining_rep = true THEN 1
           WHEN umt.type_name::text = ANY (ARRAY['financial_member'::character varying, 'non_oa_member'::character varying, 'member_pending'::character varying]::text[]) THEN 2
           ELSE NULL::integer
         END AS base_rating
       FROM public.campaign_worker_membership m_1
       JOIN public.workers w ON w.worker_id = m_1.worker_id
       LEFT JOIN public.union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
       LEFT JOIN public.member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
     ),
     ra AS (
       SELECT r_1.rating_id, r_1.worker_id, r_1.activity_id, r_1.rating, r_1.binary_value, r_1.rated_at,
         CASE
           WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['yes'::text, 'y'::text, 'true'::text, 't'::text, '1'::text]) THEN 'yes'::text
           WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['no'::text, 'n'::text, 'false'::text, 'f'::text, '0'::text]) THEN 'no'::text
           WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = 'abstained'::text THEN 'abstain'::text
           WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text]) THEN lower(TRIM(BOTH FROM r_1.binary_value))
           ELSE lower(TRIM(BOTH FROM r_1.binary_value))
         END AS binary_key,
         CASE
           WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['yes'::text, 'y'::text, 'true'::text, 't'::text, '1'::text]) THEN 'yes'::text
           WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['no'::text, 'n'::text, 'false'::text, 'f'::text, '0'::text]) THEN 'no'::text
           WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = 'abstained'::text THEN 'abstain'::text
           WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text]) THEN lower(TRIM(BOTH FROM a.supporter_outcome_value))
           ELSE COALESCE(NULLIF(lower(TRIM(BOTH FROM a.supporter_outcome_value)), ''::text), 'yes'::text)
         END AS supporter_key
       FROM public.campaign_activity_ratings r_1
       JOIN public.campaign_activities a ON a.activity_id = r_1.activity_id
       WHERE a.is_perception = false
     ),
     simulated AS (
       SELECT m.campaign_id, m.worker_id,
         CASE
           WHEN wb.base_rating IS NOT NULL THEN round((wb.base_rating::numeric + COALESCE(sum(r.rating::numeric) FILTER (WHERE r.rating IS NOT NULL), 0::numeric)) / (1 + count(r.rating_id) FILTER (WHERE r.rating IS NOT NULL))::numeric)::integer
           WHEN count(r.rating_id) FILTER (WHERE r.rating IS NOT NULL) > 0 THEN round(avg(r.rating::numeric) FILTER (WHERE r.rating IS NOT NULL))::integer
           ELSE NULL::integer
         END AS cumulative_rating,
         count(DISTINCT r.activity_id) FILTER (WHERE r.rating IS NOT NULL AND (r.rating = ANY (ARRAY[1, 2])) OR r.binary_key IS NOT NULL AND (r.binary_key <> ALL (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text, 'maybe'::text])) AND r.binary_key = r.supporter_key)::integer AS supportive_activity_count
       FROM public.campaign_worker_membership m
       JOIN wb ON wb.campaign_id = m.campaign_id AND wb.worker_id = m.worker_id
       LEFT JOIN ra r ON r.worker_id = m.worker_id
                     AND r.activity_id IN (SELECT activity_id FROM fam_ids fi WHERE fi.viewing_id = m.campaign_id)
       WHERE m.campaign_id IN (61, 62, 64)
       GROUP BY m.campaign_id, m.worker_id, wb.base_rating),
     compared AS (
       SELECT s.campaign_id, s.worker_id,
              (s.cumulative_rating IS DISTINCT FROM v.cumulative_rating
               OR s.supportive_activity_count IS DISTINCT FROM v.supportive_activity_count) AS changed
       FROM simulated s
       JOIN public.campaign_worker_rating_summary v ON v.campaign_id = s.campaign_id AND v.worker_id = s.worker_id)
SELECT c.campaign_id, count(*) AS members,
       count(*) FILTER (WHERE c.changed) AS rows_changed,
       count(*) FILTER (WHERE c.changed AND EXISTS (SELECT 1 FROM public.campaign_worker_membership p
                                                     WHERE p.campaign_id = 64 AND p.worker_id = c.worker_id)) AS rows_changed_shared_with_parent,
       count(*) FILTER (WHERE c.changed AND EXISTS (SELECT 1 FROM public.campaign_activity_ratings r
                                                     WHERE r.activity_id = 88 AND r.worker_id = c.worker_id)) AS rows_changed_rated_on_88
FROM compared c
GROUP BY c.campaign_id ORDER BY c.campaign_id;
