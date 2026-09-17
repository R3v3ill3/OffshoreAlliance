-- WP3.8 rollback of 10_campaign64_family.sql (docs/organiser-ux-review/wp/wp3.8.md §3.2).
-- Operator-run only; never a migration. Recovery only.
--
-- Reverses the campaign-64 family: 61, 62 and 69 lose parent 64; activities
-- 88–92 of campaign 64 return to scope = 'campaign'. Every reversed row is
-- logged to public._oux_hygiene_log (script 91_rollback_campaign64_family) and
-- the matching 10_campaign64_family rows are stamped rolled_back_at, as the
-- WP0.4 rollbacks do. Ratings recorded from the children on 88–92 stay where
-- they are (the parent's rows, RAT-a); nothing else is touched.
--
-- Precondition: exactly the state 10 leaves behind (3 children of 64: 61, 62,
-- 69; 5 family rows: 88–92 of 64; nothing else linked or family). Any other
-- shape stops the file for inspection by hand.
--
-- A production operator must add SET LOCAL oux.env = 'production'; immediately
-- after BEGIN in this same submission. The committed file omits that line and
-- names no project.

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

DO $preconditions$
DECLARE
  v_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION '91 STOP: the WP3.8 columns are absent';
  END IF;
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '91 STOP: public._oux_hygiene_log is missing (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;

  -- Scoped to this run's rows (wp3.8.md §8.3 D9): exactly the children and
  -- family rows 10 made on 64; families made elsewhere are left alone.
  SELECT count(*) INTO v_count FROM public.campaigns WHERE parent_campaign_id = 64;
  IF v_count <> 3 THEN
    RAISE EXCEPTION '91 STOP: campaign 64 has % child campaign(s) (expected exactly 3: 61, 62, 69)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.campaigns WHERE parent_campaign_id = 64 AND campaign_id IN (61, 62, 69);
  IF v_count <> 3 THEN
    RAISE EXCEPTION '91 STOP: the children of 64 are not exactly 61, 62, 69';
  END IF;

  SELECT count(*) INTO v_count FROM public.campaign_activities WHERE campaign_id = 64 AND scope = 'family';
  IF v_count <> 5 THEN
    RAISE EXCEPTION '91 STOP: % activity row(s) of campaign 64 are scope = family (expected exactly 5: 88–92)', v_count;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.campaign_activities
  WHERE scope = 'family' AND campaign_id = 64 AND activity_id IN (88, 89, 90, 91, 92);
  IF v_count <> 5 THEN
    RAISE EXCEPTION '91 STOP: the family rows are not exactly 88–92 of campaign 64';
  END IF;
END;
$preconditions$;

-- Before-state of this run's rows only (as in 10): no global table counts,
-- which may legitimately move on a live database while this runs.
CREATE TEMP TABLE _wp38_91_before ON COMMIT DROP AS
SELECT
  (SELECT md5(string_agg((to_jsonb(c) - 'parent_campaign_id' - 'updated_at')::text, '|' ORDER BY c.campaign_id))
     FROM public.campaigns c WHERE c.campaign_id IN (61, 62, 64, 69)) AS campaigns_md5,
  (SELECT md5(string_agg((to_jsonb(a) - 'scope')::text, '|' ORDER BY a.activity_id))
     FROM public.campaign_activities a WHERE a.campaign_id = 64) AS activities_64_md5,
  (SELECT md5(string_agg(r::text, '|' ORDER BY r.rating_id))
     FROM public.campaign_activity_ratings r
     JOIN public.campaign_activities a ON a.activity_id = r.activity_id
    WHERE a.campaign_id IN (61, 62, 64, 69)) AS ratings_md5,
  (SELECT count(*) FROM public._oux_hygiene_log
     WHERE script = '10_campaign64_family' AND rolled_back_at IS NULL) AS forward_log_pending;

CREATE TEMP TABLE _wp38_91_log_ids (log_id bigint PRIMARY KEY) ON COMMIT DROP;

-- 1. Children ← no parent.
WITH changed AS (
  UPDATE public.campaigns AS c
  SET parent_campaign_id = NULL
  WHERE c.campaign_id IN (61, 62, 69)
    AND c.parent_campaign_id = 64
  RETURNING c.campaign_id, c.updated_at
),
logged AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT
    '91_rollback_campaign64_family',
    'update',
    'campaigns',
    jsonb_build_object('campaign_id', c.campaign_id),
    jsonb_build_object('campaign_id', c.campaign_id, 'parent_campaign_id', 64),
    jsonb_build_object('campaign_id', c.campaign_id, 'parent_campaign_id', NULL, 'updated_at', c.updated_at),
    'WP3.8 (wp3.8.md §3.2): 10_campaign64_family reversed — parent link cleared'
  FROM changed AS c
  RETURNING log_id
)
INSERT INTO _wp38_91_log_ids (log_id)
SELECT log_id FROM logged;

-- 2. Assessments ← campaign.
WITH changed AS (
  UPDATE public.campaign_activities AS a
  SET scope = 'campaign'
  WHERE a.activity_id IN (88, 89, 90, 91, 92)
    AND a.campaign_id = 64
    AND a.scope = 'family'
  RETURNING a.activity_id, a.campaign_id, a.activity_kind
),
logged AS (
  INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
  SELECT
    '91_rollback_campaign64_family',
    'update',
    'campaign_activities',
    jsonb_build_object('activity_id', c.activity_id),
    jsonb_build_object('activity_id', c.activity_id, 'campaign_id', c.campaign_id, 'activity_kind', c.activity_kind, 'scope', 'family'),
    jsonb_build_object('activity_id', c.activity_id, 'campaign_id', c.campaign_id, 'activity_kind', c.activity_kind, 'scope', 'campaign'),
    'WP3.8 (wp3.8.md §3.2): 10_campaign64_family reversed — scope back to campaign'
  FROM changed AS c
  RETURNING log_id
)
INSERT INTO _wp38_91_log_ids (log_id)
SELECT log_id FROM logged;

-- 3. Stamp the forward rows (WP0.4 convention; makes a re-run of 10 auditable).
UPDATE public._oux_hygiene_log
SET rolled_back_at = now()
WHERE script = '10_campaign64_family'
  AND rolled_back_at IS NULL;

DO $postconditions$
DECLARE
  v_before record;
  v_count bigint;
  v_logged bigint := (SELECT count(*) FROM _wp38_91_log_ids);
BEGIN
  SELECT * INTO v_before FROM _wp38_91_before;

  SELECT count(*) INTO v_count FROM public.campaigns WHERE parent_campaign_id = 64;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '91 post-check failed: campaign 64 still has % child campaign(s)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.campaign_activities WHERE campaign_id = 64 AND scope = 'family';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '91 post-check failed: % activity row(s) of campaign 64 are still scope = family', v_count;
  END IF;
  IF v_logged <> 8 THEN
    RAISE EXCEPTION '91 post-check failed: logged % rows (expected 8)', v_logged;
  END IF;
  IF (SELECT md5(string_agg((to_jsonb(c) - 'parent_campaign_id' - 'updated_at')::text, '|' ORDER BY c.campaign_id))
        FROM public.campaigns c WHERE c.campaign_id IN (61, 62, 64, 69)) IS DISTINCT FROM v_before.campaigns_md5
  THEN
    RAISE EXCEPTION '91 post-check failed: a column other than parent_campaign_id/updated_at changed on 61/62/64/69';
  END IF;
  IF (SELECT md5(string_agg((to_jsonb(a) - 'scope')::text, '|' ORDER BY a.activity_id))
        FROM public.campaign_activities a WHERE a.campaign_id = 64) IS DISTINCT FROM v_before.activities_64_md5
  THEN
    RAISE EXCEPTION '91 post-check failed: a column other than scope changed on campaign 64''s activities, or an activity row came or went';
  END IF;
  IF (SELECT md5(string_agg(r::text, '|' ORDER BY r.rating_id))
        FROM public.campaign_activity_ratings r
        JOIN public.campaign_activities a ON a.activity_id = r.activity_id
       WHERE a.campaign_id IN (61, 62, 64, 69)) IS DISTINCT FROM v_before.ratings_md5
  THEN
    RAISE EXCEPTION '91 post-check failed: a rating row changed';
  END IF;
END;
$postconditions$;

SELECT
  (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id = 64)                          AS children_of_64_after,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id = 64 AND scope = 'family') AS family_on_64_after,
  (SELECT count(*) FROM _wp38_91_log_ids)                                                       AS rows_logged,
  b.forward_log_pending                                                                         AS forward_rows_pending_before,
  (SELECT count(*) FROM public._oux_hygiene_log
     WHERE script = '10_campaign64_family' AND rolled_back_at IS NULL)                           AS forward_rows_pending_after,
  b.campaigns_md5     AS campaigns_md5_unchanged,
  b.activities_64_md5 AS activities_64_md5_unchanged,
  b.ratings_md5       AS ratings_md5_unchanged
FROM _wp38_91_before AS b;

COMMIT;
