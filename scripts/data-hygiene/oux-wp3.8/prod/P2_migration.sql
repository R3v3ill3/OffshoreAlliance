-- WP3.8 PRODUCTION RUN SHEET — step P2 (mutating: the schema migration)
-- Project: production (gteygwfgjvczanmrwgbr). Run in the Supabase SQL Editor as postgres, one
-- submission = this whole file. Prepared by the agent from the committed script; the agent
-- never runs anything on production.
-- What it does: applies supabase/migrations/20260917100000_wp3_8_campaign_families.sql verbatim inside one transaction, then records its ledger row. Adds two columns, a trigger, a helper function, a delete policy and rewrites two views. Writes no application row. Refuses to run twice.
-- Expect: a single result row matching the "expected" comment at the very end. If anything raises, the whole transaction rolls back and nothing is applied: paste the error.
-- Paste back: the result row (or the error).

BEGIN;
SET LOCAL oux.env = 'production';

-- WP3.8: campaign families and shared assessments
-- (docs/organiser-ux-review/wp/wp3.8.md §3.1, §3.3, §3.4; decisions FAM-a,
-- SET-a, ASC-a, RAT-a, VIEW-a; §9.1 answers TRG-a and RD-a).
--
-- Schema only: no row is written. Adds campaigns.parent_campaign_id (one
-- level, enforced by trg_campaigns_enforce_one_level), campaign_activities.scope
-- ('campaign' | 'family'), the helper campaign_family_activity_ids(), the
-- member-scoped ratings delete policy (RD-a), and rewrites two views under the
-- one rule "owned by this campaign, or owned by my parent with scope = family".
--
-- Supabase db push wraps each migration file in one transaction. This file
-- deliberately has no explicit BEGIN/COMMIT so it follows repository convention
-- (wp2.1.md §7.1). Operator alternative: psql -1 -v ON_ERROR_STOP=1 -f <file>,
-- or one SQL Editor submission wrapped BEGIN; … COMMIT; (wp3.8.md §0.1).
--
-- Later migrations checked for a redefinition of anything touched here
-- (grep over supabase/migrations/2026090[9]* and 202609[1-9]*, 2026-09-17):
--   * campaign_worker_rating_summary — defined once, baseline :10699–10760;
--     no later migration redefines it (WP2.1 :383/:992 recreated
--     v_section_plan_workforce_mapping, a dependent, with the baseline text).
--   * vw_sms_chat_session_report — baseline :16498–16542 only.
--   * policies on campaign_activity_ratings — baseline :25927 (insert),
--     :26303 (update), :26949 (select), :27522 (delete) only; no later
--     migration touches them. WP1.6 (20260909120000) rewrote the campaigns,
--     campaign_organising_units, campaign_worker_membership,
--     campaign_leader_worker_links and campaign_worker_ou policies only.
--   * triggers on campaigns — baseline trg_campaigns_updated_at :22409 and
--     trg_prevent_live_sms_episode_delete :22549 only; none added later.
--   * campaign_family_activity_ids / campaigns_enforce_one_level — new names,
--     absent everywhere.
--
-- Sections, in order:
--   1. Precondition DO block: refuse a repeated or partial apply; the live
--      summary view must be the baseline's (security_invoker, six columns,
--      the r.campaign_id = m.campaign_id join this migration replaces).
--   2. Counts temp table (ON COMMIT DROP): row counts, the view's column
--      list and a whole-view checksum.
--   3. campaigns.parent_campaign_id (+ CHECK, partial index, COMMENT).
--   4. campaign_activities.scope (+ CHECK, partial index, COMMENT).
--   5. campaigns_enforce_one_level() and trg_campaigns_enforce_one_level.
--   6. campaign_family_activity_ids(integer) and its grants.
--   7. campaign_worker_rating_summary (security_invoker, same columns).
--   8. vw_sms_chat_session_report.
--   8b. Policy wp38_car_delete_family (RD-a, §3.4).
--   9. Post-assertions.
--
-- Rollback: scripts/data-hygiene/oux-wp3.8/90_rollback_wp3_8_campaign_families.sql.
-- No application code reads parent_campaign_id or scope until WP3.8 Stage 3.

-- ---------------------------------------------------------------------------
-- 1. Preconditions (wp3.8.md §3.1 item 1)
-- ---------------------------------------------------------------------------

DO $preconditions$
DECLARE
  v_columns text;
  v_viewdef text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaigns'::regclass
      AND attname = 'parent_campaign_id'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: campaigns.parent_campaign_id already exists; refusing a partial or repeated migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaign_activities'::regclass
      AND attname = 'scope'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: campaign_activities.scope already exists; refusing a partial or repeated migration';
  END IF;

  IF to_regprocedure('public.campaign_family_activity_ids(integer)') IS NOT NULL
     OR to_regprocedure('public.campaigns_enforce_one_level()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: campaign_family_activity_ids() or campaigns_enforce_one_level() already exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.campaigns'::regclass
      AND tgname = 'trg_campaigns_enforce_one_level'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: trg_campaigns_enforce_one_level already exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.campaign_activity_ratings'::regclass
      AND polname = 'wp38_car_delete_family'
  ) THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: policy wp38_car_delete_family already exists';
  END IF;

  IF to_regclass('public.idx_campaigns_parent_campaign_id') IS NOT NULL
     OR to_regclass('public.idx_campaign_activities_family') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: a WP3.8 index already exists';
  END IF;

  IF to_regclass('public.campaign_worker_rating_summary') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_class AS c
       WHERE c.oid = 'public.campaign_worker_rating_summary'::regclass
         AND c.relkind = 'v'
         AND 'security_invoker=true' = ANY (c.reloptions)
     )
  THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: campaign_worker_rating_summary is missing or not security_invoker (stop condition S3)';
  END IF;

  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_columns
  FROM pg_attribute
  WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass
    AND attnum > 0
    AND NOT attisdropped;
  IF v_columns IS DISTINCT FROM
     'campaign_id,worker_id,cumulative_rating,last_activity_rating,has_supportive_activity_rating,supportive_activity_count'
  THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: campaign_worker_rating_summary columns are "%", not the baseline six (stop condition S3)', v_columns;
  END IF;

  v_viewdef := pg_get_viewdef('public.campaign_worker_rating_summary'::regclass, true);
  IF position('r.campaign_id = m.campaign_id' IN v_viewdef) = 0 THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: the live campaign_worker_rating_summary is not the baseline definition (no r.campaign_id = m.campaign_id join); refusing to overwrite an unknown view (stop condition S3)';
  END IF;

  IF to_regclass('public.vw_sms_chat_session_report') IS NULL THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: vw_sms_chat_session_report is missing';
  END IF;
  v_viewdef := pg_get_viewdef('public.vw_sms_chat_session_report'::regclass, true);
  IF position('a.campaign_id = o.campaign_id' IN v_viewdef) = 0 THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: the live vw_sms_chat_session_report is not the baseline definition (no a.campaign_id = o.campaign_id predicate)';
  END IF;

  IF to_regprocedure('public.can_write_to_campaign(integer)') IS NULL
     OR to_regprocedure('public.get_user_role()') IS NULL
  THEN
    RAISE EXCEPTION 'WP3.8 precondition failed: can_write_to_campaign() or get_user_role() is missing';
  END IF;
END;
$preconditions$;

-- ---------------------------------------------------------------------------
-- 2. Counts (wp3.8.md §3.1 item 2)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _wp38_counts (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _wp38_counts (metric, value)
VALUES
  ('campaigns',                 (SELECT count(*) FROM public.campaigns)),
  ('campaign_activities',       (SELECT count(*) FROM public.campaign_activities)),
  ('campaign_activity_ratings', (SELECT count(*) FROM public.campaign_activity_ratings)),
  ('campaign_worker_membership',(SELECT count(*) FROM public.campaign_worker_membership));

CREATE TEMP TABLE _wp38_view_shape (
  which text PRIMARY KEY,
  columns text NOT NULL,
  checksum text
) ON COMMIT DROP;

INSERT INTO _wp38_view_shape (which, columns, checksum)
SELECT
  'before',
  (SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' ORDER BY attnum)
     FROM pg_attribute
    WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass
      AND attnum > 0
      AND NOT attisdropped),
  (SELECT md5(coalesce(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id), ''))
     FROM public.campaign_worker_rating_summary AS v);

-- ---------------------------------------------------------------------------
-- 3. campaigns.parent_campaign_id (wp3.8.md §3.1 item 3; FAM-a)
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaigns
  ADD COLUMN parent_campaign_id integer NULL
    REFERENCES public.campaigns(campaign_id) ON DELETE SET NULL,
  ADD CONSTRAINT campaigns_parent_not_self CHECK (parent_campaign_id IS NULL OR parent_campaign_id <> campaign_id);

CREATE INDEX idx_campaigns_parent_campaign_id
  ON public.campaigns (parent_campaign_id)
  WHERE parent_campaign_id IS NOT NULL;

COMMENT ON COLUMN public.campaigns.parent_campaign_id IS
  'WP3.8 (FAM-a, wp3.8.md §3.1): the one parent this campaign is part of. One level only (trg_campaigns_enforce_one_level). '
  'Changes nothing about membership, groups, units or placements. ON DELETE SET NULL: deleting the parent unlinks its children; '
  'the parent''s activities and their ratings go with the parent (campaign_activities FK CASCADE :23305), so a child stops seeing '
  'the shared assessments and the ratings recorded from it — they were the parent''s rows (RAT-a).';

-- ---------------------------------------------------------------------------
-- 4. campaign_activities.scope (wp3.8.md §3.1 item 4; ASC-a)
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaign_activities
  ADD COLUMN scope text NOT NULL DEFAULT 'campaign'
    CONSTRAINT campaign_activities_scope_check CHECK (scope IN ('campaign', 'family'));

CREATE INDEX idx_campaign_activities_family
  ON public.campaign_activities (campaign_id)
  WHERE scope = 'family';

COMMENT ON COLUMN public.campaign_activities.scope IS
  'WP3.8 (ASC-a, wp3.8.md §3.1). campaign = visible in the owning campaign only. family = also visible, and ratable, in every '
  'campaign whose parent_campaign_id is this activity''s campaign_id. The rule every reader applies: "owned by this campaign, or '
  'owned by my parent with scope = family" — public.campaign_family_activity_ids(). Ratings are never copied: a rating recorded '
  'from a child lands on this row (RAT-a); a child reads a shared activity''s ratings for its own members only (VIEW-a).';

-- ---------------------------------------------------------------------------
-- 5. One level, enforced in the database (wp3.8.md §3.1 item 5; SET-a, TRG-a)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campaigns_enforce_one_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_parent public.campaigns%ROWTYPE;
  v_parent_changed boolean := TG_OP = 'INSERT' OR NEW.parent_campaign_id IS DISTINCT FROM OLD.parent_campaign_id;
BEGIN
  -- Concurrency (wp3.8.md §7 R10, §8.3 D16). The structural checks below read
  -- OTHER rows under READ COMMITTED with no lock: two concurrent transactions
  -- (UPDATE A SET parent = B while UPDATE B SET parent = C; or INSERT C2 with
  -- parent = C while UPDATE C SET parent = P) would each pass its checks and
  -- both commit, leaving a two-level chain — the FK's FOR KEY SHARE on the
  -- parent row does not serialise a non-key column update. Transaction-scoped
  -- advisory locks on this campaign and, when a parent is set, on the parent,
  -- always in ascending id order (least, then greatest) so two writers cannot
  -- deadlock, serialise every write of the family columns that touches either
  -- id. Taken on clearing too (cheap, and keeps the rule uniform). Deliberately
  -- NOT SELECT … FOR UPDATE / FOR NO KEY UPDATE on the parent row: under RLS
  -- the wp16_campaigns_update USING clause applies to a locking clause, so a
  -- child-only writer would get no row and skip the parent checks.
  PERFORM pg_advisory_xact_lock(hashtext('wp38_campaign_family'),
                                least(NEW.campaign_id, coalesce(NEW.parent_campaign_id, NEW.campaign_id)));
  IF NEW.parent_campaign_id IS NOT NULL AND NEW.parent_campaign_id <> NEW.campaign_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('wp38_campaign_family'),
                                  greatest(NEW.campaign_id, NEW.parent_campaign_id));
  END IF;

  -- A parent (a campaign with children) can never become an episode or the standing campaign.
  IF (NEW.is_sms_episode OR NEW.is_standing)
     AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.parent_campaign_id = NEW.campaign_id) THEN
    RAISE EXCEPTION 'campaign_family_parent_kind' USING ERRCODE = 'check_violation',
      DETAIL = 'A campaign with child campaigns cannot be an SMS episode or the standing campaign.';
  END IF;
  IF NEW.parent_campaign_id IS NULL THEN RETURN NEW; END IF;     -- clearing is always allowed (SET-a)

  IF NEW.parent_campaign_id = NEW.campaign_id THEN
    RAISE EXCEPTION 'campaign_family_self' USING ERRCODE = 'check_violation',
      DETAIL = 'A campaign cannot be part of itself.';
  END IF;
  IF NEW.is_sms_episode OR NEW.is_standing THEN
    RAISE EXCEPTION 'campaign_family_child_kind' USING ERRCODE = 'check_violation',
      DETAIL = 'An SMS episode or the standing campaign cannot be part of a family.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaigns c WHERE c.parent_campaign_id = NEW.campaign_id) THEN
    RAISE EXCEPTION 'campaign_family_child_has_children' USING ERRCODE = 'check_violation',
      DETAIL = 'A campaign that has child campaigns cannot itself be part of another campaign (one level).';
  END IF;

  SELECT * INTO v_parent FROM public.campaigns WHERE campaign_id = NEW.parent_campaign_id;
  IF NOT FOUND THEN RETURN NEW; END IF;                            -- the FK raises 23503
  IF v_parent.parent_campaign_id IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_family_parent_has_parent' USING ERRCODE = 'check_violation',
      DETAIL = 'The chosen parent is itself part of a campaign (one level).';
  END IF;
  IF v_parent.is_sms_episode OR v_parent.is_standing OR v_parent.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_family_parent_kind' USING ERRCODE = 'check_violation',
      DETAIL = 'An SMS episode, the standing campaign or an archived container cannot be a parent.';
  END IF;

  -- SET-a (TRG-a): setting a parent needs write access to the parent as well. The child side is the row policy
  -- (wp16_campaigns_update). Operator scripts run as postgres (auth.uid() IS NULL) and skip this arm.
  IF v_parent_changed AND auth.uid() IS NOT NULL
     AND NOT public.can_write_to_campaign(NEW.parent_campaign_id) THEN
    RAISE EXCEPTION 'campaign_family_parent_not_writable' USING ERRCODE = '42501',
      DETAIL = 'You need write access to the parent campaign to make this campaign part of it.';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.campaigns_enforce_one_level() IS
  'WP3.8 (wp3.8.md §3.1 item 5): one level of campaign families. Refuses self, a grandparent (a campaign with children choosing a parent), '
  'a grandchild (a parent that has a parent), an SMS episode / the standing campaign / an archived container on either side, a parent '
  'flipped to episode or standing while it has children, and (SET-a, when auth.uid() is set) a parent the caller cannot write to (42501). '
  'Clearing the parent is always allowed. Serialises concurrent family writes with pg_advisory_xact_lock(hashtext(''wp38_campaign_family''), id) '
  'on the campaign and the parent in ascending id order (wp3.8.md §7 R10).';

CREATE TRIGGER trg_campaigns_enforce_one_level
  BEFORE INSERT OR UPDATE OF parent_campaign_id, is_sms_episode, is_standing ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.campaigns_enforce_one_level();

-- ---------------------------------------------------------------------------
-- 6. The one rule, as a helper (wp3.8.md §3.1 item 6)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campaign_family_activity_ids(p_campaign_id integer)
RETURNS SETOF integer
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
  SELECT a.activity_id
  FROM public.campaign_activities a
  WHERE a.campaign_id = p_campaign_id
  UNION
  SELECT a.activity_id
  FROM public.campaigns c
  JOIN public.campaign_activities a ON a.campaign_id = c.parent_campaign_id
  WHERE c.campaign_id = p_campaign_id
    AND a.scope = 'family';
$function$;

COMMENT ON FUNCTION public.campaign_family_activity_ids(integer) IS
  'WP3.8 (wp3.8.md §3.1): the activities a campaign may read and rate — its own, plus its parent''s scope = family ones. '
  'One definition for SQL views and for PostgREST readers (lib/campaign/families.ts mirrors it). A parent never sees a child''s.';

-- Grants follow 20260910090000_campaign_last_activity.sql:68–72 (narrower than
-- the baseline's blanket GRANT ALL … TO anon).
REVOKE ALL ON FUNCTION public.campaign_family_activity_ids(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_family_activity_ids(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.campaign_family_activity_ids(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. campaign_worker_rating_summary (wp3.8.md §3.3; VIEW-a)
--    Baseline 20260908050000:10699–10760 with exactly two changes, each marked
--    "WP3.8": the rating_activity CTE drops the unused a.campaign_id column and
--    the outer join becomes an IN (SELECT campaign_family_activity_ids(m.campaign_id));
--    the last_activity_rating subquery does the same. Same column list, names,
--    types and order, so the seven dependents (§2 C1-dep) stay valid.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW "public"."campaign_worker_rating_summary" WITH ("security_invoker"='true') AS
 WITH "worker_base_rating" AS (
         SELECT "m_1"."campaign_id",
            "m_1"."worker_id",
                CASE
                    WHEN ("lower"(("mrt"."role_name")::"text") = ANY (ARRAY['contact'::"text", 'activist'::"text", 'delegate'::"text"])) THEN 1
                    WHEN ("w"."is_bargaining_rep" = true) THEN 1
                    WHEN (("umt"."type_name")::"text" = ANY ((ARRAY['financial_member'::character varying, 'non_oa_member'::character varying, 'member_pending'::character varying])::"text"[])) THEN 2
                    ELSE NULL::integer
                END AS "base_rating"
           FROM ((("public"."campaign_worker_membership" "m_1"
             JOIN "public"."workers" "w" ON (("w"."worker_id" = "m_1"."worker_id")))
             LEFT JOIN "public"."union_membership_types" "umt" ON (("umt"."union_membership_type_id" = "w"."union_membership_type_id")))
             LEFT JOIN "public"."member_role_types" "mrt" ON (("mrt"."role_type_id" = "w"."member_role_type_id")))
        ), "rating_activity" AS (
         SELECT "r_1"."rating_id",
            "r_1"."worker_id",
            "r_1"."activity_id",
            "r_1"."rating",
            "r_1"."binary_value",
            "r_1"."rated_at",
                CASE
                    WHEN ("lower"(TRIM(BOTH FROM "r_1"."binary_value")) = ANY (ARRAY['yes'::"text", 'y'::"text", 'true'::"text", 't'::"text", '1'::"text"])) THEN 'yes'::"text"
                    WHEN ("lower"(TRIM(BOTH FROM "r_1"."binary_value")) = ANY (ARRAY['no'::"text", 'n'::"text", 'false'::"text", 'f'::"text", '0'::"text"])) THEN 'no'::"text"
                    WHEN ("lower"(TRIM(BOTH FROM "r_1"."binary_value")) = 'abstained'::"text") THEN 'abstain'::"text"
                    WHEN ("lower"(TRIM(BOTH FROM "r_1"."binary_value")) = ANY (ARRAY['unsure'::"text", 'unknown'::"text", 'abstain'::"text"])) THEN "lower"(TRIM(BOTH FROM "r_1"."binary_value"))
                    ELSE "lower"(TRIM(BOTH FROM "r_1"."binary_value"))
                END AS "binary_key",
                CASE
                    WHEN ("lower"(TRIM(BOTH FROM "a"."supporter_outcome_value")) = ANY (ARRAY['yes'::"text", 'y'::"text", 'true'::"text", 't'::"text", '1'::"text"])) THEN 'yes'::"text"
                    WHEN ("lower"(TRIM(BOTH FROM "a"."supporter_outcome_value")) = ANY (ARRAY['no'::"text", 'n'::"text", 'false'::"text", 'f'::"text", '0'::"text"])) THEN 'no'::"text"
                    WHEN ("lower"(TRIM(BOTH FROM "a"."supporter_outcome_value")) = 'abstained'::"text") THEN 'abstain'::"text"
                    WHEN ("lower"(TRIM(BOTH FROM "a"."supporter_outcome_value")) = ANY (ARRAY['unsure'::"text", 'unknown'::"text", 'abstain'::"text"])) THEN "lower"(TRIM(BOTH FROM "a"."supporter_outcome_value"))
                    ELSE COALESCE(NULLIF("lower"(TRIM(BOTH FROM "a"."supporter_outcome_value")), ''::"text"), 'yes'::"text")
                END AS "supporter_key"
           FROM ("public"."campaign_activity_ratings" "r_1"
             JOIN "public"."campaign_activities" "a" ON (("a"."activity_id" = "r_1"."activity_id")))
          WHERE ("a"."is_perception" = false)
        )
 SELECT "m"."campaign_id",
    "m"."worker_id",
        CASE
            WHEN ("wb"."base_rating" IS NOT NULL) THEN ("round"(((("wb"."base_rating")::numeric + COALESCE("sum"(("r"."rating")::numeric) FILTER (WHERE ("r"."rating" IS NOT NULL)), (0)::numeric)) / ((1 + "count"("r"."rating_id") FILTER (WHERE ("r"."rating" IS NOT NULL))))::numeric)))::integer
            WHEN ("count"("r"."rating_id") FILTER (WHERE ("r"."rating" IS NOT NULL)) > 0) THEN ("round"("avg"(("r"."rating")::numeric) FILTER (WHERE ("r"."rating" IS NOT NULL))))::integer
            ELSE NULL::integer
        END AS "cumulative_rating",
    ( SELECT "r2"."rating"
           FROM ("public"."campaign_activity_ratings" "r2"
             JOIN "public"."campaign_activities" "a2" ON (("a2"."activity_id" = "r2"."activity_id")))
          WHERE (("a2"."activity_id" IN ( SELECT "public"."campaign_family_activity_ids"("m"."campaign_id"))) AND ("a2"."is_perception" = false) AND ("r2"."worker_id" = "m"."worker_id") AND ("r2"."rating" IS NOT NULL))   -- WP3.8: was a2.campaign_id = m.campaign_id
          ORDER BY "r2"."rated_at" DESC NULLS LAST
         LIMIT 1) AS "last_activity_rating",
    COALESCE("bool_or"(((("r"."rating" IS NOT NULL) AND ("r"."rating" = ANY (ARRAY[1, 2]))) OR (("r"."binary_key" IS NOT NULL) AND ("r"."binary_key" <> ALL (ARRAY['unsure'::"text", 'unknown'::"text", 'abstain'::"text", 'maybe'::"text"])) AND ("r"."binary_key" = "r"."supporter_key")))), false) AS "has_supportive_activity_rating",
    ("count"(DISTINCT "r"."activity_id") FILTER (WHERE ((("r"."rating" IS NOT NULL) AND ("r"."rating" = ANY (ARRAY[1, 2]))) OR (("r"."binary_key" IS NOT NULL) AND ("r"."binary_key" <> ALL (ARRAY['unsure'::"text", 'unknown'::"text", 'abstain'::"text", 'maybe'::"text"])) AND ("r"."binary_key" = "r"."supporter_key")))))::integer AS "supportive_activity_count"
   FROM (("public"."campaign_worker_membership" "m"
     JOIN "worker_base_rating" "wb" ON ((("wb"."campaign_id" = "m"."campaign_id") AND ("wb"."worker_id" = "m"."worker_id"))))
     LEFT JOIN "rating_activity" "r" ON ((("r"."worker_id" = "m"."worker_id") AND ("r"."activity_id" IN ( SELECT "public"."campaign_family_activity_ids"("m"."campaign_id"))))))   -- WP3.8: was r.campaign_id = m.campaign_id
  GROUP BY "m"."campaign_id", "m"."worker_id", "wb"."base_rating";

COMMENT ON VIEW "public"."campaign_worker_rating_summary" IS
  'Per (campaign, member): cumulative rating, last activity rating and supportive-activity flags. WP3.8 (wp3.8.md §3.3, VIEW-a): '
  'ratings are read over campaign_family_activity_ids(campaign_id) — the campaign''s own activities plus its parent''s scope = family '
  'ones — and every row still starts from campaign_worker_membership, so a child sees a shared activity''s ratings for its own members only.';

-- ---------------------------------------------------------------------------
-- 8. vw_sms_chat_session_report (wp3.8.md §3.3; §2 C6)
--    Baseline 20260908050000:16498–16542 verbatim except the one predicate
--    marked "WP3.8" in the assessments_recorded subquery. No security_invoker
--    (as today). A function referenced by a view executes as the CALLING role:
--    EXECUTE on the helper and, since it is SECURITY INVOKER, its table reads
--    are checked as the caller, not as the view's owner (only the view's own
--    table access runs as the owner). For authenticated and service_role that
--    is EXECUTE (granted below) plus the USING (true) select policies on both
--    tables, so the report's numbers are unchanged. For anon — which holds the
--    baseline's blanket GRANT ALL on this view (20260908050000:32995) — the
--    view now fails with "permission denied for function
--    campaign_family_activity_ids"; no reader uses anon (the sms-reporting and
--    reports routes read through the session server client). Recorded in
--    wp3.8.md §7 R11 / §8.3 D5.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW "public"."vw_sms_chat_session_report" AS
 WITH "openers" AS (
         SELECT "l"."campaign_id",
            "l"."list_id",
            "l"."name",
            "l"."status",
            "l"."created_by",
            "l"."created_at",
            "i"."item_id",
            "i"."worker_id",
            "i"."conversation_id",
            "i"."sent_at",
            "c"."last_inbound_at",
            "c"."closed_at",
            ( SELECT "min"("m"."created_at") AS "min"
                   FROM "public"."sms_messages" "m"
                  WHERE (("m"."conversation_id" = "i"."conversation_id") AND (("m"."direction")::"text" = 'inbound'::"text") AND ("m"."created_at" >= "i"."sent_at"))) AS "first_reply_at"
           FROM (("public"."sms_lists" "l"
             JOIN "public"."sms_list_items" "i" ON (("i"."list_id" = "l"."list_id")))
             LEFT JOIN "public"."sms_conversations" "c" ON (("c"."conversation_id" = "i"."conversation_id")))
          WHERE ((("l"."mode")::"text" = 'p2p'::"text") AND ("i"."sent_at" IS NOT NULL))
        )
 SELECT "campaign_id",
    "list_id",
    "name",
    "status",
    "created_by",
    "created_at",
    ("count"(*))::integer AS "openers_sent",
    ("count"("first_reply_at"))::integer AS "replies_received",
    "round"(((100.0 * ("count"("first_reply_at"))::numeric) / (NULLIF("count"(*), 0))::numeric), 1) AS "response_rate_pct",
    ("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY ((EXTRACT(epoch FROM ("first_reply_at" - "sent_at")))::double precision)) FILTER (WHERE ("first_reply_at" IS NOT NULL)))::numeric AS "median_first_reply_seconds",
    ("count"(*) FILTER (WHERE ("last_inbound_at" IS NOT NULL)))::integer AS "conversations_responded",
    ("count"(*) FILTER (WHERE ("closed_at" IS NOT NULL)))::integer AS "conversations_closed",
    (( SELECT "count"(*) AS "count"
           FROM ("public"."campaign_activity_ratings" "r"
             JOIN "public"."campaign_activities" "a" ON (("a"."activity_id" = "r"."activity_id")))
          WHERE (("a"."activity_id" IN ( SELECT "public"."campaign_family_activity_ids"("o"."campaign_id"))) AND (("r"."source")::"text" = ANY ((ARRAY['sms_chat'::character varying, 'sms_survey'::character varying, 'sms_inbound'::character varying])::"text"[])) AND ("r"."worker_id" IN ( SELECT "o2"."worker_id"
                   FROM "openers" "o2"
                  WHERE ("o2"."list_id" = "o"."list_id"))))))::integer AS "assessments_recorded"   -- WP3.8: was a.campaign_id = o.campaign_id
   FROM "openers" "o"
  GROUP BY "campaign_id", "list_id", "name", "status", "created_by", "created_at";

COMMENT ON VIEW "public"."vw_sms_chat_session_report" IS 'Per P2P chat session (sms_lists.mode = ''p2p''): openers sent, replies received, response rate, median seconds to first reply, conversations that ever received a reply, conversations marked complete, and SMS-sourced assessments recorded against the session''s members. WP3.8: assessments recorded on the campaign''s own activities or its parent''s scope = family ones (campaign_family_activity_ids). Group by created_by for per-organiser throughput.';

-- ---------------------------------------------------------------------------
-- 8b. Ratings delete from a child, member-scoped (wp3.8.md §3.4; RD-a)
--     Additive: policies are OR-ed, so the owner path ("Can delete
--     campaign_activity_ratings", baseline :27522) is unchanged. A writer of a
--     child may delete a rating on a shared activity only for a member of that
--     child — the same boundary as VIEW-a.
-- ---------------------------------------------------------------------------

CREATE POLICY "wp38_car_delete_family" ON public.campaign_activity_ratings FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.campaign_activities a
  JOIN public.campaigns child ON child.parent_campaign_id = a.campaign_id
  JOIN public.campaign_worker_membership m ON m.campaign_id = child.campaign_id AND m.worker_id = campaign_activity_ratings.worker_id
  WHERE a.activity_id = campaign_activity_ratings.activity_id
    AND a.scope = 'family'
    AND public.get_user_role() = ANY (ARRAY['admin','user'])
    AND public.can_write_to_campaign(child.campaign_id)));

-- ---------------------------------------------------------------------------
-- 9. Post-assertions (wp3.8.md §3.1 item 9)
-- ---------------------------------------------------------------------------

DO $postconditions$
DECLARE
  v_before record;
  v_columns text;
  v_checksum text;
  v_default text;
  v_count bigint;
  v_probe_campaign integer;
  v_helper_count bigint;
  v_own_count bigint;
BEGIN
  -- Columns, defaults, constraints, FK name (the loader in
  -- lib/campaign/campaign-parent.ts embeds through campaigns_parent_campaign_id_fkey).
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id'
      AND NOT attisdropped AND NOT attnotnull AND atttypid = 'integer'::regtype
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaigns.parent_campaign_id is missing or not a nullable integer';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaigns'::regclass AND conname = 'campaigns_parent_campaign_id_fkey'
      AND contype = 'f' AND confrelid = 'public.campaigns'::regclass AND confdeltype = 'n'
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaigns_parent_campaign_id_fkey (ON DELETE SET NULL) is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaigns'::regclass AND conname = 'campaigns_parent_not_self' AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaigns_parent_not_self is missing';
  END IF;

  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_default
  FROM pg_attribute a
  JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.campaign_activities'::regclass AND a.attname = 'scope' AND NOT a.attisdropped AND a.attnotnull;
  IF v_default IS NULL OR position('campaign' IN v_default) = 0 THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_activities.scope is missing, nullable or not defaulted to ''campaign'' (default: %)', v_default;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaign_activities'::regclass AND conname = 'campaign_activities_scope_check' AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_activities_scope_check is missing';
  END IF;

  -- Indexes.
  IF to_regclass('public.idx_campaigns_parent_campaign_id') IS NULL
     OR to_regclass('public.idx_campaign_activities_family') IS NULL
  THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: a WP3.8 index is missing';
  END IF;

  -- Trigger.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.campaigns'::regclass
      AND t.tgname = 'trg_campaigns_enforce_one_level'
      AND NOT t.tgisinternal
      AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: trg_campaigns_enforce_one_level is missing or disabled';
  END IF;

  -- Helper: SECURITY INVOKER, search_path pinned, grants as stated.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS p
    WHERE p.oid = to_regprocedure('public.campaign_family_activity_ids(integer)')
      AND p.prosecdef = false
      AND p.provolatile = 's'
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%')
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_family_activity_ids() is missing, SECURITY DEFINER, not STABLE or has no search_path';
  END IF;
  IF has_function_privilege('anon', 'public.campaign_family_activity_ids(integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.campaign_family_activity_ids(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.campaign_family_activity_ids(integer)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_family_activity_ids() grants are incorrect';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS p
    WHERE p.oid = to_regprocedure('public.campaigns_enforce_one_level()')
      AND p.prosecdef = false
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%')
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaigns_enforce_one_level() is missing, SECURITY DEFINER or has no search_path';
  END IF;

  -- Policy (RD-a).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.campaign_activity_ratings'::regclass
      AND polname = 'wp38_car_delete_family'
      AND polcmd = 'd'
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: policy wp38_car_delete_family is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.campaign_activity_ratings'::regclass
      AND polname = 'Can delete campaign_activity_ratings'
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: the owner delete policy on campaign_activity_ratings is gone';
  END IF;

  -- Summary view: same column list (name:type, order), still security_invoker,
  -- byte-identical output (no campaign has a parent yet).
  SELECT * INTO v_before FROM _wp38_view_shape WHERE which = 'before';
  SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' ORDER BY attnum) INTO v_columns
  FROM pg_attribute
  WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_columns IS DISTINCT FROM v_before.columns THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_worker_rating_summary columns changed: "%" -> "%"', v_before.columns, v_columns;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class AS c
    WHERE c.oid = 'public.campaign_worker_rating_summary'::regclass
      AND c.relkind = 'v'
      AND 'security_invoker=true' = ANY (c.reloptions)
  ) THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_worker_rating_summary lost security_invoker';
  END IF;
  IF position('campaign_family_activity_ids' IN pg_get_viewdef('public.campaign_worker_rating_summary'::regclass, true)) = 0
     OR position('r.campaign_id = m.campaign_id' IN pg_get_viewdef('public.campaign_worker_rating_summary'::regclass, true)) > 0
  THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_worker_rating_summary was not rewritten';
  END IF;
  IF position('campaign_family_activity_ids' IN pg_get_viewdef('public.vw_sms_chat_session_report'::regclass, true)) = 0
     OR position('a.campaign_id = o.campaign_id' IN pg_get_viewdef('public.vw_sms_chat_session_report'::regclass, true)) > 0
  THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: vw_sms_chat_session_report was not rewritten';
  END IF;
  SELECT md5(coalesce(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id), '')) INTO v_checksum
  FROM public.campaign_worker_rating_summary AS v;
  IF v_checksum IS DISTINCT FROM v_before.checksum THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_worker_rating_summary output changed (% -> %) although no campaign has a parent', v_before.checksum, v_checksum;
  END IF;

  -- No data change.
  SELECT count(*) INTO v_count FROM public.campaigns WHERE parent_campaign_id IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: children_now = % (expected 0)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.campaign_activities WHERE scope = 'family';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: family_now = % (expected 0)', v_count;
  END IF;
  IF (SELECT count(*) FROM public.campaigns)
       <> (SELECT value FROM _wp38_counts WHERE metric = 'campaigns')
     OR (SELECT count(*) FROM public.campaign_activities)
       <> (SELECT value FROM _wp38_counts WHERE metric = 'campaign_activities')
     OR (SELECT count(*) FROM public.campaign_activity_ratings)
       <> (SELECT value FROM _wp38_counts WHERE metric = 'campaign_activity_ratings')
     OR (SELECT count(*) FROM public.campaign_worker_membership)
       <> (SELECT value FROM _wp38_counts WHERE metric = 'campaign_worker_membership')
  THEN
    RAISE EXCEPTION 'WP3.8 postcondition failed: campaign, activity, rating or membership counts changed';
  END IF;

  -- The helper on an existing campaign returns exactly that campaign's own
  -- activities (no parent exists yet). The campaign with the most activities is
  -- the strongest probe; an empty database is skipped.
  SELECT a.campaign_id INTO v_probe_campaign
  FROM public.campaign_activities AS a
  GROUP BY a.campaign_id ORDER BY count(*) DESC, a.campaign_id LIMIT 1;
  IF v_probe_campaign IS NOT NULL THEN
    SELECT count(*) INTO v_helper_count FROM public.campaign_family_activity_ids(v_probe_campaign);
    SELECT count(*) INTO v_own_count FROM public.campaign_activities WHERE campaign_id = v_probe_campaign;
    IF v_helper_count <> v_own_count THEN
      RAISE EXCEPTION 'WP3.8 postcondition failed: campaign_family_activity_ids(%) returned % ids, the campaign owns %',
        v_probe_campaign, v_helper_count, v_own_count;
    END IF;
  END IF;

  RAISE NOTICE 'WP3.8 applied: parent_campaign_id, scope, one-level trigger, helper, two views and the RD-a policy in place; children_now = 0, family_now = 0';
END;
$postconditions$;

SELECT
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped) AS parent_col,
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped) AS scope_col,
  (to_regprocedure('public.campaign_family_activity_ids(integer)') IS NOT NULL) AS helper_present,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.campaigns'::regclass AND tgname = 'trg_campaigns_enforce_one_level' AND NOT tgisinternal) AS trigger_present,
  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.campaign_activity_ratings'::regclass AND polname = 'wp38_car_delete_family') AS policy_present,
  (SELECT reloptions FROM pg_class WHERE oid = 'public.campaign_worker_rating_summary'::regclass) AS view_reloptions,
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass AND attnum > 0 AND NOT attisdropped) AS view_columns,
  (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id IS NOT NULL) AS children_now,
  (SELECT count(*) FROM public.campaign_activities WHERE scope = 'family') AS family_now;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260917100000', 'wp3_8_campaign_families');

COMMIT;

-- Read-only verification after COMMIT (wp3.8.md §0.2); the editor shows this last result set.
SELECT
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped) AS parent_col,
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped) AS scope_col,
  (to_regprocedure('public.campaign_family_activity_ids(integer)') IS NOT NULL) AS helper_present,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.campaigns'::regclass AND tgname = 'trg_campaigns_enforce_one_level' AND NOT tgisinternal) AS trigger_present,
  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.campaign_activity_ratings'::regclass AND polname = 'wp38_car_delete_family') AS policy_present,
  (SELECT reloptions FROM pg_class WHERE oid = 'public.campaign_worker_rating_summary'::regclass) AS view_reloptions,
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass AND attnum > 0 AND NOT attisdropped) AS view_columns,
  (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id IS NOT NULL) AS children_now,
  (SELECT count(*) FROM public.campaign_activities WHERE scope = 'family') AS family_now,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260917100000') AS ledger_row;
-- expected: 1, 1, true, 1, 1, {security_invoker=true},
-- campaign_id,worker_id,cumulative_rating,last_activity_rating,has_supportive_activity_rating,supportive_activity_count, 0, 0, 1
