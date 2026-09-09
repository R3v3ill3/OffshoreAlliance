-- WP1.6 pre-flight (wp1.6.md §6, R1). READ-ONLY. Safe on any environment,
-- production included: one SELECT, no impersonation, no SET ROLE, no
-- transaction, nothing written. Run as the operator's normal psql / SQL
-- editor session.
--
-- Question it answers: which non-episode, non-standing campaigns have a named
-- organiser who, after WP1.6's write policies, would have NO route to write
-- access on their own campaign? A route is any of: admin role, lead/coordinator
-- work_role, a campaign_organisers roster row (WP0.4 script 02), an active
-- campaign_edit_permissions grant, or having created the campaign.
--
-- Expected result: ZERO ROWS. Any row names a campaign WP0.4 script 02 has not
-- covered. Do not deploy WP1.6 (and do not run WP0.4 script 01) until it
-- returns zero.
--
-- Predicate notes (fix round 1, reviewer finding 1):
--   * up.role = 'user' — only user-role accounts can lose anything. Admins keep
--     every write through is_admin(); viewers have no write access before or
--     after WP1.6, so they lose nothing and are excluded on purpose.
--   * work_role IS NULL is included. A NULL work_role is not lead/coordinator
--     and so gets no write route from the work_role arm; `work_role NOT IN
--     (...)` alone is NULL for those rows and silently drops them from the
--     result, which is exactly the account that would be missed.
--
-- Run:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/data-hygiene/oux-wp1.6/00_preflight_organiser_write_access.sql

\set ON_ERROR_STOP on

SELECT c.campaign_id, c.name, c.organiser_id, up.display_name, up.role, up.work_role
FROM public.campaigns c
JOIN public.organisers o     ON o.organiser_id = c.organiser_id
JOIN public.user_profiles up ON up.organiser_id = o.organiser_id
WHERE c.is_sms_episode = false
  AND c.is_standing = false
  AND up.role = 'user'
  AND c.created_by IS DISTINCT FROM up.user_id
  AND (
    up.work_role IS NULL
    OR up.work_role NOT IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_organisers co
    WHERE co.campaign_id = c.campaign_id AND co.organiser_id = o.organiser_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_edit_permissions cep
    WHERE cep.campaign_id = c.campaign_id AND cep.granted_to = up.user_id AND cep.status = 'active'
  )
ORDER BY c.campaign_id;

-- Expected: (0 rows)
