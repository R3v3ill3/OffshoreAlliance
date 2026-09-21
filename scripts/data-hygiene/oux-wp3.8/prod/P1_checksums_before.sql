-- WP3.8 PRODUCTION RUN SHEET — step P1 (read-only)
-- Project: production (gteygwfgjvczanmrwgbr). Run in the Supabase SQL Editor as postgres, one
-- submission = this whole file. Prepared by the agent from the committed script; the agent
-- never runs anything on production.
-- What it does: reads three checksums and counts over campaigns 61, 62, 64 before anything changes. No write.
-- Expect: one row with activities_md5, ratings_md5, summary_md5, activities_n, summary_rows.
-- Paste back: the whole row.

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

