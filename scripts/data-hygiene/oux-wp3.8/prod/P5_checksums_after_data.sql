-- WP3.8 PRODUCTION RUN SHEET — step P5 (read-only)
-- Project: production (gteygwfgjvczanmrwgbr). Run in the Supabase SQL Editor as postgres, one
-- submission = this whole file. Prepared by the agent from the committed script; the agent
-- never runs anything on production.
-- What it does: the checksums after P4.
-- Expect: ratings_md5 IDENTICAL to P3 (no rating touched); activities_md5 different from P3 (five scope values changed); summary_md5 different from P3 (61 and 62 now count the shared ratings); children_n 3; family_n 5.
-- Paste back: the whole row.

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
