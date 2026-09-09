-- WP1.6 post-flight (wp1.6.md §6). READ-ONLY. Safe on any environment,
-- production included: one SELECT, no impersonation, no SET ROLE, nothing
-- written.
--
-- Per-account write coverage after the deploy, so the operator can see the
-- shape of the change: for every profile, how many campaigns it sits on the
-- roster of (campaign_organisers — the WP0.4 script 02 route) and how many it
-- created (campaigns.created_by — the decision 8 route). There is no single
-- expected value; compare against the §6 discussion and the pre-flight
-- (which must still be zero rows afterwards — see the README run sheet).
--
-- Run:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/data-hygiene/oux-wp1.6/01_postflight_write_coverage.sql

\set ON_ERROR_STOP on

SELECT up.display_name, up.role, up.work_role,
       count(*) FILTER (WHERE co.campaign_id IS NOT NULL) AS campaigns_on_roster,
       count(*) FILTER (WHERE c.created_by = up.user_id)  AS campaigns_created
FROM public.user_profiles up
LEFT JOIN public.organisers o           ON o.organiser_id = up.organiser_id
LEFT JOIN public.campaign_organisers co ON co.organiser_id = o.organiser_id
LEFT JOIN public.campaigns c            ON c.created_by = up.user_id
GROUP BY 1, 2, 3
ORDER BY 2, 1;
