-- WP3.8 campaign-families rollback (docs/organiser-ux-review/wp/wp3.8.md §3.1
-- "Rollback"). Operator/agent-run only; never a migration. Reverses
-- supabase/migrations/20260917100000_wp3_8_campaign_families.sql: drops the
-- RD-a policy, restores vw_sms_chat_session_report and
-- campaign_worker_rating_summary verbatim from the baseline
-- (20260908050000_baseline_schema.sql :16498–16542 and :10699–10760), drops the
-- helper, the one-level trigger and its function, the two partial indexes and
-- the two columns. Application row data is never changed: the file STOPS while
-- any campaign has a parent or any activity is scope = 'family' (run
-- 91_rollback_campaign64_family.sql first — this rollback never silently
-- drops data).
--
-- Migration-history repair is a separate, recovery-only command requiring
-- explicit approval and is not executed here:
--   -- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260917100000';

BEGIN;

-- A future production operator must add SET LOCAL oux.env = 'production';
-- immediately after BEGIN in this same submission.
DO $environment_guard$
DECLARE
  v_valid boolean;
BEGIN
  IF to_regclass('public._oux_env_marker') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*) = 1 AND bool_and(env IN (''clone'', ''dev'')) FROM public._oux_env_marker'
      INTO v_valid;
    IF v_valid THEN RETURN; END IF;
    RAISE EXCEPTION 'Refusing to run: _oux_env_marker is not a valid clone/dev singleton';
  END IF;
  IF current_setting('oux.env', true) = 'production' THEN RETURN; END IF;
  RAISE EXCEPTION
    'Refusing to run: no _oux_env_marker table and no oux.env guard in this transaction';
END;
$environment_guard$;

DO $precondition$
DECLARE
  v_children bigint;
  v_family bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped
  ) OR to_regprocedure('public.campaign_family_activity_ids(integer)') IS NULL
    OR to_regprocedure('public.campaigns_enforce_one_level()') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.campaigns'::regclass AND tgname = 'trg_campaigns_enforce_one_level' AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'WP3.8 rollback STOP: the WP3.8 objects are absent (nothing to roll back, or a partial state to inspect by hand)';
  END IF;

  -- Never drop data: a parent link or a family activity means the data run
  -- sheet (10_campaign64_family.sql) or the app has used the columns.
  SELECT count(*) INTO v_children FROM public.campaigns WHERE parent_campaign_id IS NOT NULL;
  SELECT count(*) INTO v_family FROM public.campaign_activities WHERE scope = 'family';
  IF v_children <> 0 OR v_family <> 0 THEN
    RAISE EXCEPTION
      'WP3.8 rollback STOP: % campaign(s) have a parent and % activity row(s) are scope = family; run 91_rollback_campaign64_family.sql (or clear them under an approved run sheet) first',
      v_children, v_family;
  END IF;
END;
$precondition$;

CREATE TEMP TABLE _wp38_90_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.campaigns)                  AS campaigns,
  (SELECT count(*) FROM public.campaign_activities)        AS activities,
  (SELECT count(*) FROM public.campaign_activity_ratings)  AS ratings,
  (SELECT count(*) FROM public.campaign_worker_membership) AS memberships,
  (SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' ORDER BY attnum)
     FROM pg_attribute
    WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass AND attnum > 0 AND NOT attisdropped) AS summary_columns,
  (SELECT md5(coalesce(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id), ''))
     FROM public.campaign_worker_rating_summary AS v) AS summary_checksum_before,
  (SELECT count(*) FROM pg_policy
     WHERE polrelid = 'public.campaign_activity_ratings'::regclass AND polname = 'wp38_car_delete_family') AS policy_before;

-- 1. The RD-a policy (references scope and parent_campaign_id).
DROP POLICY IF EXISTS "wp38_car_delete_family" ON public.campaign_activity_ratings;

-- 2. vw_sms_chat_session_report, verbatim from the baseline (:16498–16542).
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
          WHERE (("a"."campaign_id" = "o"."campaign_id") AND (("r"."source")::"text" = ANY ((ARRAY['sms_chat'::character varying, 'sms_survey'::character varying, 'sms_inbound'::character varying])::"text"[])) AND ("r"."worker_id" IN ( SELECT "o2"."worker_id"
                   FROM "openers" "o2"
                  WHERE ("o2"."list_id" = "o"."list_id"))))))::integer AS "assessments_recorded"
   FROM "openers" "o"
  GROUP BY "campaign_id", "list_id", "name", "status", "created_by", "created_at";

COMMENT ON VIEW "public"."vw_sms_chat_session_report" IS 'Per P2P chat session (sms_lists.mode = ''p2p''): openers sent, replies received, response rate, median seconds to first reply, conversations that ever received a reply, conversations marked complete, and SMS-sourced assessments recorded against the session''s members. Group by created_by for per-organiser throughput.';

-- 3. campaign_worker_rating_summary, verbatim from the baseline (:10699–10760);
--    same column list, so the dependents (wp3.8.md §2 C1-dep) stay valid.
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
            "a"."campaign_id",
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
          WHERE (("a2"."campaign_id" = "m"."campaign_id") AND ("a2"."is_perception" = false) AND ("r2"."worker_id" = "m"."worker_id") AND ("r2"."rating" IS NOT NULL))
          ORDER BY "r2"."rated_at" DESC NULLS LAST
         LIMIT 1) AS "last_activity_rating",
    COALESCE("bool_or"(((("r"."rating" IS NOT NULL) AND ("r"."rating" = ANY (ARRAY[1, 2]))) OR (("r"."binary_key" IS NOT NULL) AND ("r"."binary_key" <> ALL (ARRAY['unsure'::"text", 'unknown'::"text", 'abstain'::"text", 'maybe'::"text"])) AND ("r"."binary_key" = "r"."supporter_key")))), false) AS "has_supportive_activity_rating",
    ("count"(DISTINCT "r"."activity_id") FILTER (WHERE ((("r"."rating" IS NOT NULL) AND ("r"."rating" = ANY (ARRAY[1, 2]))) OR (("r"."binary_key" IS NOT NULL) AND ("r"."binary_key" <> ALL (ARRAY['unsure'::"text", 'unknown'::"text", 'abstain'::"text", 'maybe'::"text"])) AND ("r"."binary_key" = "r"."supporter_key")))))::integer AS "supportive_activity_count"
   FROM (("public"."campaign_worker_membership" "m"
     JOIN "worker_base_rating" "wb" ON ((("wb"."campaign_id" = "m"."campaign_id") AND ("wb"."worker_id" = "m"."worker_id"))))
     LEFT JOIN "rating_activity" "r" ON ((("r"."worker_id" = "m"."worker_id") AND ("r"."campaign_id" = "m"."campaign_id"))))
  GROUP BY "m"."campaign_id", "m"."worker_id", "wb"."base_rating";

COMMENT ON VIEW "public"."campaign_worker_rating_summary" IS NULL;

-- 4. Helper (the views no longer reference it).
DROP FUNCTION public.campaign_family_activity_ids(integer);

-- 5. Trigger and its function.
DROP TRIGGER trg_campaigns_enforce_one_level ON public.campaigns;
DROP FUNCTION public.campaigns_enforce_one_level();

-- 6. campaign_activities.scope (no CASCADE: an unexpected dependent stops the file).
DROP INDEX public.idx_campaign_activities_family;
ALTER TABLE public.campaign_activities DROP COLUMN scope;

-- 7. campaigns.parent_campaign_id (dropping the column drops its FK).
DROP INDEX public.idx_campaigns_parent_campaign_id;
ALTER TABLE public.campaigns
  DROP CONSTRAINT campaigns_parent_not_self,
  DROP COLUMN parent_campaign_id;

DO $postconditions$
DECLARE
  v_before record;
  v_columns text;
  v_checksum text;
BEGIN
  SELECT * INTO v_before FROM _wp38_90_counts;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped
  ) OR EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped
  ) OR to_regprocedure('public.campaign_family_activity_ids(integer)') IS NOT NULL
    OR to_regprocedure('public.campaigns_enforce_one_level()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.campaigns'::regclass AND tgname = 'trg_campaigns_enforce_one_level' AND NOT tgisinternal
    )
    OR to_regclass('public.idx_campaigns_parent_campaign_id') IS NOT NULL
    OR to_regclass('public.idx_campaign_activities_family') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.campaigns'::regclass
        AND conname IN ('campaigns_parent_not_self', 'campaigns_parent_campaign_id_fkey')
    )
    OR EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polrelid = 'public.campaign_activity_ratings'::regclass AND polname = 'wp38_car_delete_family'
    )
  THEN
    RAISE EXCEPTION 'WP3.8 rollback failed: a WP3.8 object remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.campaign_activity_ratings'::regclass AND polname = 'Can delete campaign_activity_ratings'
  ) THEN
    RAISE EXCEPTION 'WP3.8 rollback failed: the owner delete policy on campaign_activity_ratings is gone';
  END IF;

  IF position('r.campaign_id = m.campaign_id' IN pg_get_viewdef('public.campaign_worker_rating_summary'::regclass, true)) = 0
     OR position('campaign_family_activity_ids' IN pg_get_viewdef('public.campaign_worker_rating_summary'::regclass, true)) > 0
     OR NOT EXISTS (
       SELECT 1 FROM pg_class AS c
       WHERE c.oid = 'public.campaign_worker_rating_summary'::regclass
         AND c.relkind = 'v'
         AND 'security_invoker=true' = ANY (c.reloptions)
     )
  THEN
    RAISE EXCEPTION 'WP3.8 rollback failed: campaign_worker_rating_summary was not restored to the baseline';
  END IF;
  IF position('a.campaign_id = o.campaign_id' IN pg_get_viewdef('public.vw_sms_chat_session_report'::regclass, true)) = 0
     OR position('campaign_family_activity_ids' IN pg_get_viewdef('public.vw_sms_chat_session_report'::regclass, true)) > 0
  THEN
    RAISE EXCEPTION 'WP3.8 rollback failed: vw_sms_chat_session_report was not restored to the baseline';
  END IF;

  SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' ORDER BY attnum) INTO v_columns
  FROM pg_attribute
  WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_columns IS DISTINCT FROM v_before.summary_columns THEN
    RAISE EXCEPTION 'WP3.8 rollback failed: campaign_worker_rating_summary columns changed: "%" -> "%"', v_before.summary_columns, v_columns;
  END IF;

  -- No campaign had a parent and no activity was family (precondition), so
  -- the restored view must produce byte-identical output.
  SELECT md5(coalesce(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id), '')) INTO v_checksum
  FROM public.campaign_worker_rating_summary AS v;
  IF v_checksum IS DISTINCT FROM v_before.summary_checksum_before THEN
    RAISE EXCEPTION 'WP3.8 rollback failed: campaign_worker_rating_summary output changed (% -> %)', v_before.summary_checksum_before, v_checksum;
  END IF;

  IF (SELECT count(*) FROM public.campaigns) <> v_before.campaigns
     OR (SELECT count(*) FROM public.campaign_activities) <> v_before.activities
     OR (SELECT count(*) FROM public.campaign_activity_ratings) <> v_before.ratings
     OR (SELECT count(*) FROM public.campaign_worker_membership) <> v_before.memberships
  THEN
    RAISE EXCEPTION 'WP3.8 rollback failed: campaign, activity, rating or membership counts changed';
  END IF;
END;
$postconditions$;

SELECT
  c.policy_before,
  (SELECT count(*) FROM pg_policy
     WHERE polrelid = 'public.campaign_activity_ratings'::regclass AND polname = 'wp38_car_delete_family') AS policy_after,
  (EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped)) AS parent_col_remains,
  (EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped)) AS scope_col_remains,
  (to_regprocedure('public.campaign_family_activity_ids(integer)') IS NOT NULL) AS helper_remains,
  (EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.campaigns'::regclass AND tgname = 'trg_campaigns_enforce_one_level' AND NOT tgisinternal)) AS trigger_remains,
  (SELECT reloptions FROM pg_class WHERE oid = 'public.campaign_worker_rating_summary'::regclass) AS view_reloptions,
  c.summary_checksum_before,
  (SELECT md5(coalesce(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id), ''))
     FROM public.campaign_worker_rating_summary AS v) AS summary_checksum_after,
  c.campaigns AS campaigns_unchanged,
  c.activities AS activities_unchanged,
  c.ratings AS ratings_unchanged,
  c.memberships AS memberships_unchanged
FROM _wp38_90_counts AS c;

COMMIT;
