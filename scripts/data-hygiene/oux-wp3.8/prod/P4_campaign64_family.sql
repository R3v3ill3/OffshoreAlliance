-- WP3.8 PRODUCTION RUN SHEET — step P4 (mutating: the campaign-64 family data)
-- Project: production (gteygwfgjvczanmrwgbr). Run in the Supabase SQL Editor as postgres, one
-- submission = this whole file. Prepared by the agent from the committed script; the agent
-- never runs anything on production.
-- What it does: links campaigns 61 (Fugro), 62 (programmed ROV) and 69 (Total Marine Technology) to campaign 64 as their parent, and marks assessments 88, 89, 90, 91, 92 of campaign 64 as shared with the family (93 and 95 untouched). Eight rows, all logged to _oux_hygiene_log. Run STRAIGHT AFTER the merged code is live on production.
-- Expect: two result sets; the editor shows the last: activity rows 88–92 scope family, 93 and 95 scope campaign. The one before it shows 61, 62, 69 with parent_campaign_id 64 and 64 with NULL. If it stops at a precondition nothing changed: paste the error.
-- Paste back: both result sets if you can, otherwise the last one plus a note that no error appeared.

-- WP3.8 data run sheet: the campaign-64 family (docs/organiser-ux-review/wp/wp3.8.md §3.2).
-- Operator-run only; never a migration. Runs AFTER the WP3.8 migration is on the
-- target database and the WP3.8 code is deployed (wp3.8.md §0.1 step 6 (e)).
--
-- What it does (the operator's answer of 2026-09-17, DECISIONS.md:82,
-- PROGRESS.md:111 — the agent never decides the set):
--   * campaigns 61, 62 and 69 become part of campaign 64 (parent_campaign_id = 64);
--   * activities 88, 89, 90, 91 and 92 of campaign 64 become scope = 'family';
--   * activities 93 and 95 of campaign 64 stay scope = 'campaign' (asserted).
-- Every changed row is logged to public._oux_hygiene_log (WP0.4 shape: script,
-- action, table_name, row_pk, before_row, after_row, note) so the change is
-- auditable and reversible (91_rollback_campaign64_family.sql).
--
-- Runs as postgres, so the trigger's SET-a arm (auth.uid() IS NULL) is skipped
-- and its structural arms (one level, kinds) still fire. updated_at advances on
-- 61/62/69 through trg_campaigns_updated_at (expected metadata churn).
-- Every precondition and post-assertion is scoped to this run's rows (the
-- children of 64, 64's activities); families organisers may have made
-- elsewhere through the Basics sheet since the deploy neither stop nor
-- enter this run. Run it straight after the deploy all the same (README).
--
-- A production operator must add SET LOCAL oux.env = 'production'; immediately
-- after BEGIN in this same submission. The committed file omits that line and
-- names no project. Not idempotent by design: a second run stops at the
-- preconditions (the rows are no longer in their pre-run state).

BEGIN;
SET LOCAL oux.env = 'production';

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

DO $preconditions$
DECLARE
  v_count bigint;
  v_id integer;
BEGIN
  -- The WP3.8 objects.
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped
  ) OR to_regprocedure('public.campaign_family_activity_ids(integer)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.campaigns'::regclass AND tgname = 'trg_campaigns_enforce_one_level' AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION '10 STOP: the WP3.8 migration (20260917100000_wp3_8_campaign_families) is not applied here';
  END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '10 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;

  -- The parent: 64 exists, has no parent, is neither an episode nor the standing campaign, and is not archived.
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaign_id = 64 AND parent_campaign_id IS NULL
      AND is_sms_episode = false AND is_standing = false AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION '10 STOP: campaign 64 is missing, already has a parent, is an SMS episode / the standing campaign, or is archived';
  END IF;

  -- The children: 61, 62, 69 exist, have no parent, have no children, are neither episode nor standing.
  FOR v_id IN SELECT unnest(ARRAY[61, 62, 69]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaign_id = v_id AND parent_campaign_id IS NULL
        AND is_sms_episode = false AND is_standing = false
    ) THEN
      RAISE EXCEPTION '10 STOP: campaign % is missing, already has a parent, or is an SMS episode / the standing campaign', v_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.campaigns WHERE parent_campaign_id = v_id) THEN
      RAISE EXCEPTION '10 STOP: campaign % already has child campaigns (one level)', v_id;
    END IF;
  END LOOP;

  -- The activities: 88–92 exist on 64, are assessments, and are still scope = campaign.
  SELECT count(*) INTO v_count
  FROM public.campaign_activities
  WHERE activity_id IN (88, 89, 90, 91, 92)
    AND campaign_id = 64 AND activity_kind = 'assessment' AND scope = 'campaign';
  IF v_count <> 5 THEN
    RAISE EXCEPTION '10 STOP: expected activities 88–92 on campaign 64 as scope = campaign assessments, found %', v_count;
  END IF;

  -- 93 and 95 are left alone; the assertion pins the operator's answer.
  SELECT count(*) INTO v_count
  FROM public.campaign_activities
  WHERE activity_id IN (93, 95) AND campaign_id = 64 AND scope = 'campaign';
  IF v_count <> 2 THEN
    RAISE EXCEPTION '10 STOP: expected activities 93 and 95 on campaign 64 as scope = campaign, found %', v_count;
  END IF;

  -- Scoped to this run's rows (wp3.8.md §8.3 D9): 64 has no children yet and
  -- none of its activities is family yet. Families made elsewhere by
  -- organisers through the Basics sheet after the deploy are not this run's
  -- business and must not stop it.
  SELECT count(*) INTO v_count FROM public.campaigns WHERE parent_campaign_id = 64;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: campaign 64 already has % child campaign(s)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.campaign_activities WHERE campaign_id = 64 AND scope = 'family';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '10 STOP: % activity row(s) of campaign 64 are already scope = family', v_count;
  END IF;
END;
$preconditions$;

-- Before-state of this run's rows only (wp3.8.md §8.3 D9): the four campaign
-- rows minus the two columns this run changes (parent_campaign_id and, through
-- trg_campaigns_updated_at, updated_at), campaign 64's activities minus scope,
-- and every rating on the four campaigns' activities. Global table counts are
-- not asserted: on production this runs after the deploy, so memberships and
-- ratings elsewhere may legitimately move while it runs.
CREATE TEMP TABLE _wp38_10_before ON COMMIT DROP AS
SELECT
  (SELECT md5(string_agg((to_jsonb(c) - 'parent_campaign_id' - 'updated_at')::text, '|' ORDER BY c.campaign_id))
     FROM public.campaigns c WHERE c.campaign_id IN (61, 62, 64, 69)) AS campaigns_md5,
  (SELECT md5(string_agg((to_jsonb(a) - 'scope')::text, '|' ORDER BY a.activity_id))
     FROM public.campaign_activities a WHERE a.campaign_id = 64) AS activities_64_md5,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id = 61) AS own_61,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id = 62) AS own_62,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id = 69) AS own_69,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id = 64) AS own_64,
  (SELECT md5(string_agg(r::text, '|' ORDER BY r.rating_id))
     FROM public.campaign_activity_ratings r
     JOIN public.campaign_activities a ON a.activity_id = r.activity_id
    WHERE a.campaign_id IN (61, 62, 64, 69)) AS ratings_md5;

-- updated_at of the three children, captured for the log (before_row) and for the rollback.
CREATE TEMP TABLE _wp38_10_children ON COMMIT DROP AS
SELECT campaign_id, updated_at
FROM public.campaigns
WHERE campaign_id IN (61, 62, 69);

CREATE TEMP TABLE _wp38_10_log_ids (log_id bigint PRIMARY KEY) ON COMMIT DROP;

-- 1. Children → parent 64.
WITH changed AS (
  UPDATE public.campaigns AS c
  SET parent_campaign_id = 64
  WHERE c.campaign_id IN (61, 62, 69)
    AND c.parent_campaign_id IS NULL
  RETURNING c.campaign_id, c.parent_campaign_id, c.updated_at
),
logged AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT
    '10_campaign64_family',
    'update',
    'campaigns',
    jsonb_build_object('campaign_id', c.campaign_id),
    jsonb_build_object('campaign_id', c.campaign_id, 'parent_campaign_id', NULL, 'updated_at', b.updated_at),
    jsonb_build_object('campaign_id', c.campaign_id, 'parent_campaign_id', c.parent_campaign_id, 'updated_at', c.updated_at),
    'WP3.8 (wp3.8.md §3.2): campaign made part of campaign 64 (operator answer of 2026-09-17)'
  FROM changed AS c
  JOIN _wp38_10_children AS b ON b.campaign_id = c.campaign_id
  RETURNING log_id
)
INSERT INTO _wp38_10_log_ids (log_id)
SELECT log_id FROM logged;

-- 2. The sector-wide assessments → family.
WITH changed AS (
  UPDATE public.campaign_activities AS a
  SET scope = 'family'
  WHERE a.activity_id IN (88, 89, 90, 91, 92)
    AND a.campaign_id = 64
    AND a.scope = 'campaign'
  RETURNING a.activity_id, a.campaign_id, a.activity_kind, a.scope
),
logged AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT
    '10_campaign64_family',
    'update',
    'campaign_activities',
    jsonb_build_object('activity_id', c.activity_id),
    jsonb_build_object('activity_id', c.activity_id, 'campaign_id', c.campaign_id, 'activity_kind', c.activity_kind, 'scope', 'campaign'),
    jsonb_build_object('activity_id', c.activity_id, 'campaign_id', c.campaign_id, 'activity_kind', c.activity_kind, 'scope', c.scope),
    'WP3.8 (wp3.8.md §3.2): sector-wide assessment of campaign 64 shared with its child campaigns'
  FROM changed AS c
  RETURNING log_id
)
INSERT INTO _wp38_10_log_ids (log_id)
SELECT log_id FROM logged;

DO $postconditions$
DECLARE
  v_before record;
  v_count bigint;
  v_logged bigint := (SELECT count(*) FROM _wp38_10_log_ids);
  v_expected integer[];
  v_actual integer[];
BEGIN
  SELECT * INTO v_before FROM _wp38_10_before;

  -- Exactly three children of 64, and they are 61, 62, 69 (scoped: other
  -- families on the database are not this run's).
  SELECT count(*) INTO v_count FROM public.campaigns WHERE parent_campaign_id = 64;
  IF v_count <> 3 THEN
    RAISE EXCEPTION '10 post-check failed: campaign 64 has % child campaign(s) (expected 3)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.campaigns WHERE parent_campaign_id = 64 AND campaign_id IN (61, 62, 69);
  IF v_count <> 3 THEN
    RAISE EXCEPTION '10 post-check failed: % of 61/62/69 have parent 64 (expected 3)', v_count;
  END IF;

  -- Exactly five family rows on 64, exactly 88–92.
  SELECT count(*) INTO v_count FROM public.campaign_activities WHERE campaign_id = 64 AND scope = 'family';
  IF v_count <> 5 THEN
    RAISE EXCEPTION '10 post-check failed: % activity row(s) of campaign 64 are scope = family (expected 5)', v_count;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.campaign_activities
  WHERE scope = 'family' AND campaign_id = 64 AND activity_id IN (88, 89, 90, 91, 92);
  IF v_count <> 5 THEN
    RAISE EXCEPTION '10 post-check failed: the family rows are not exactly 88–92 of campaign 64';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.campaign_activities
  WHERE activity_id IN (93, 95) AND campaign_id = 64 AND scope = 'campaign';
  IF v_count <> 2 THEN
    RAISE EXCEPTION '10 post-check failed: activities 93/95 were changed';
  END IF;

  -- campaign_family_activity_ids(61) = 61's own ids ∪ {88..92}; the same shape for 62 and 69.
  SELECT array_agg(activity_id ORDER BY activity_id) INTO v_expected
  FROM (
    SELECT activity_id FROM public.campaign_activities WHERE campaign_id = 61
    UNION SELECT unnest(ARRAY[88, 89, 90, 91, 92])
  ) AS x;
  SELECT array_agg(id ORDER BY id) INTO v_actual FROM public.campaign_family_activity_ids(61) AS id;
  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION '10 post-check failed: campaign_family_activity_ids(61) = %, expected %', v_actual, v_expected;
  END IF;
  IF (SELECT count(*) FROM public.campaign_family_activity_ids(62)) <> v_before.own_62 + 5
     OR (SELECT count(*) FROM public.campaign_family_activity_ids(69)) <> v_before.own_69 + 5
     OR (SELECT count(*) FROM public.campaign_family_activity_ids(64)) <> v_before.own_64
  THEN
    RAISE EXCEPTION '10 post-check failed: campaign_family_activity_ids() counts for 62/69/64 are not own + 5 / own + 5 / own';
  END IF;

  -- Nothing else on this run's rows changed: the four campaign rows apart from
  -- parent_campaign_id / updated_at, 64's activities apart from scope, and
  -- every rating on the four campaigns' activities.
  IF (SELECT md5(string_agg((to_jsonb(c) - 'parent_campaign_id' - 'updated_at')::text, '|' ORDER BY c.campaign_id))
        FROM public.campaigns c WHERE c.campaign_id IN (61, 62, 64, 69)) IS DISTINCT FROM v_before.campaigns_md5
  THEN
    RAISE EXCEPTION '10 post-check failed: a column other than parent_campaign_id/updated_at changed on 61/62/64/69';
  END IF;
  IF (SELECT md5(string_agg((to_jsonb(a) - 'scope')::text, '|' ORDER BY a.activity_id))
        FROM public.campaign_activities a WHERE a.campaign_id = 64) IS DISTINCT FROM v_before.activities_64_md5
  THEN
    RAISE EXCEPTION '10 post-check failed: a column other than scope changed on campaign 64''s activities, or an activity row came or went';
  END IF;
  IF (SELECT md5(string_agg(r::text, '|' ORDER BY r.rating_id))
        FROM public.campaign_activity_ratings r
        JOIN public.campaign_activities a ON a.activity_id = r.activity_id
       WHERE a.campaign_id IN (61, 62, 64, 69)) IS DISTINCT FROM v_before.ratings_md5
  THEN
    RAISE EXCEPTION '10 post-check failed: a rating row changed';
  END IF;
  IF v_logged <> 8 THEN
    RAISE EXCEPTION '10 post-check failed: logged % rows (expected 8: 3 campaigns + 5 activities)', v_logged;
  END IF;
END;
$postconditions$;

SELECT
  (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id = 64)                          AS children,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id = 64 AND scope = 'family') AS family,
  (SELECT count(*) FROM _wp38_10_log_ids)                                   AS rows_logged,
  b.own_61, b.own_62, b.own_69, b.own_64,
  (SELECT count(*) FROM public.campaign_family_activity_ids(61)) AS visible_61,
  (SELECT count(*) FROM public.campaign_family_activity_ids(62)) AS visible_62,
  (SELECT count(*) FROM public.campaign_family_activity_ids(69)) AS visible_69,
  (SELECT count(*) FROM public.campaign_family_activity_ids(64)) AS visible_64
FROM _wp38_10_before AS b;

COMMIT;

-- Read-only verification (wp3.8.md §3.2, step (f)): run after COMMIT in the same
-- or a separate submission. Expected: 61, 62, 69 → parent 64 with
-- visible_activities = own count + 5; 64 → parent NULL; 88–92 family, 93 and 95
-- campaign. If this does not show exactly children = 3 and family = 5, stop:
-- run 91_rollback_campaign64_family.sql and report.
SELECT c.campaign_id, c.name, c.parent_campaign_id, c.updated_at,
       (SELECT count(*) FROM public.campaign_family_activity_ids(c.campaign_id)) AS visible_activities
FROM public.campaigns c WHERE c.campaign_id IN (61, 62, 64, 69) ORDER BY c.campaign_id;
SELECT activity_id, campaign_id, scope FROM public.campaign_activities WHERE campaign_id = 64 ORDER BY activity_id;
