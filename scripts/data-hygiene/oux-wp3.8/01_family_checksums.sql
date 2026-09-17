-- WP3.8 read-only checksums (docs/organiser-ux-review/wp/wp3.8.md §0.3).
-- No write, no transaction control, no session setting, no environment marker.
-- Any project: agent on dev / the realistic data set, operator on production.
--
-- Two labelled statements; run whichever applies (the SQL Editor returns one
-- result set per submission, so submit them separately):
--   A. BEFORE the WP3.8 migration (the columns parent_campaign_id / scope do
--      not exist yet, so the full variant would error).
--   B. AFTER the WP3.8 migration (adds children_n and family_n).
--
-- a::text / r::text / v::text include every column, so after the migration the
-- activities checksum differs from before ONLY because each row gained
-- scope = 'campaign'. The rehearsal compares before-forward with after-rollback
-- (must be equal) and after-forward-1 with after-forward-2 (must be equal).
-- The ratings checksum and the summary checksum must be identical at every
-- point until the data run sheet (10_campaign64_family.sql) runs; after it the
-- activities checksum for 64 changes by exactly the five scope values, the
-- ratings checksum is unchanged, and the summary rows for 61/62 change per
-- §5.3's prediction.
--
-- Measured on the realistic data set on 2026-09-17 (pre-migration, variant A):
-- activities_md5 8a477f78…, ratings_md5 e4e8fa5c…, summary_md5 9ccbaa63…,
-- activities_n 8, summary_rows 388 (61 = 48, 62 = 64, 64 = 276).

-- ============ A. Pre-migration variant (5 columns) ============
SELECT
  (SELECT md5(string_agg(a::text, '|' ORDER BY a.activity_id))
     FROM public.campaign_activities a WHERE a.campaign_id IN (61,62,64))                      AS activities_md5,
  (SELECT md5(string_agg(r::text, '|' ORDER BY r.rating_id))
     FROM public.campaign_activity_ratings r
     JOIN public.campaign_activities a ON a.activity_id = r.activity_id
    WHERE a.campaign_id IN (61,62,64))                                                          AS ratings_md5,
  (SELECT md5(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id))
     FROM public.campaign_worker_rating_summary v WHERE v.campaign_id IN (61,62,64))          AS summary_md5,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id IN (61,62,64))            AS activities_n,
  (SELECT count(*) FROM public.campaign_worker_rating_summary WHERE campaign_id IN (61,62,64)) AS summary_rows;

-- ============ B. Post-migration variant (7 columns) ============
SELECT
  (SELECT md5(string_agg(a::text, '|' ORDER BY a.activity_id))
     FROM public.campaign_activities a WHERE a.campaign_id IN (61,62,64))                      AS activities_md5,
  (SELECT md5(string_agg(r::text, '|' ORDER BY r.rating_id))
     FROM public.campaign_activity_ratings r
     JOIN public.campaign_activities a ON a.activity_id = r.activity_id
    WHERE a.campaign_id IN (61,62,64))                                                          AS ratings_md5,
  (SELECT md5(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id))
     FROM public.campaign_worker_rating_summary v WHERE v.campaign_id IN (61,62,64))          AS summary_md5,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id IN (61,62,64))            AS activities_n,
  (SELECT count(*) FROM public.campaign_worker_rating_summary WHERE campaign_id IN (61,62,64)) AS summary_rows,
  (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id IS NOT NULL)                 AS children_n,   -- errors before the migration: expected, run variant A then
  (SELECT count(*) FROM public.campaign_activities WHERE scope = 'family')                    AS family_n;
