-- WP1.3 — "last activity" for the My campaigns cards.
--
-- One read-only function so the page fetches the latest rating / call / SMS /
-- list fire for every card in ONE round trip (PostgREST has no per-group max).
--
-- SECURITY INVOKER (the default, stated explicitly): every table below is read
-- under the caller's own RLS, exactly as a direct SELECT would be. Each one
-- already has a `FOR SELECT TO authenticated USING (true)` policy in the
-- baseline (20260908050000_baseline_schema.sql):
--   campaign_activity_ratings  :26949   campaign_activities :26945
--   call_attempts              :26681   call_list_items     :26689
--   call_lists                 :26697   sms_conversations   :26821
--   campaign_worker_lists      :26737
-- No table, no policy, no grant on any table. STABLE, LANGUAGE sql.
--
-- Semantics kept on purpose:
--   * `is_perception = false` mirrors campaign_worker_rating_summary's own
--     filter, so "latest rating" means the same thing as on the wall chart.
--   * `fired_at IS NOT NULL` is implied by max(); there is deliberately NO
--     `status = 'fired'` filter — a fired-then-archived list keeps its fired_at.
--   * The array is capped at 200 ids so a crafted call cannot ask for the
--     whole table; the client never sends more than one page of cards.
--   * No index is added here (the rating arm has none on rated_at). Dev scale
--     is trivial; see wp1.3.md §2.9 R5 / Q1.

CREATE OR REPLACE FUNCTION "public"."campaign_last_activity"("p_campaign_ids" integer[])
RETURNS TABLE (
  "campaign_id" integer,
  "last_activity_at" timestamp with time zone,
  "last_activity_kind" text
)
LANGUAGE "sql" STABLE SECURITY INVOKER
SET "search_path" TO 'public'
AS $$
  SELECT ids.cid,
         v.at,
         v.kind
  FROM unnest((coalesce(p_campaign_ids, ARRAY[]::integer[]))[1:200]) AS ids(cid)
  CROSS JOIN LATERAL (
    SELECT x.at, x.kind
    FROM (VALUES
      ((SELECT max(r.rated_at)
          FROM public.campaign_activity_ratings r
          JOIN public.campaign_activities a ON a.activity_id = r.activity_id
         WHERE a.campaign_id = ids.cid AND a.is_perception = false), 'rating'::text),
      ((SELECT max(ca.started_at)
          FROM public.call_attempts ca
          JOIN public.call_list_items cli ON cli.item_id = ca.list_item_id
          JOIN public.call_lists cl ON cl.list_id = cli.list_id
         WHERE cl.campaign_id = ids.cid), 'call'::text),
      ((SELECT max(sc.last_message_at)
          FROM public.sms_conversations sc
         WHERE sc.campaign_id = ids.cid), 'sms'::text),
      ((SELECT max(l.fired_at)
          FROM public.campaign_worker_lists l
         WHERE l.campaign_id = ids.cid), 'list_fire'::text)
    ) AS x(at, kind)
    WHERE x.at IS NOT NULL
    ORDER BY x.at DESC
    LIMIT 1
  ) AS v;
$$;

ALTER FUNCTION "public"."campaign_last_activity"(integer[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."campaign_last_activity"(integer[]) IS
  'WP1.3: latest rating / call / SMS / list-fire timestamp per campaign for the '
  'My campaigns cards. SECURITY INVOKER — reads under the caller''s RLS. Read-only.';

-- Deliberately narrower than the baseline's blanket GRANT ALL ... TO anon,
-- matching 20260909100000_workspace_mode.sql.
REVOKE ALL ON FUNCTION "public"."campaign_last_activity"(integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."campaign_last_activity"(integer[]) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."campaign_last_activity"(integer[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."campaign_last_activity"(integer[]) TO "service_role";
