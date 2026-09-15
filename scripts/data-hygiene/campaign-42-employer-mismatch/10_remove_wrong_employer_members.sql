-- Remove campaign 42 members whose employer is not in campaign_employers.
-- Operator-run only. Not a migration.
--
-- THESE ROWS COME BACK if wall-chart sync still uses employer-OR-worksite.
-- Deploy the AND-default matcher (this PR) BEFORE running this file, and
-- leave campaign 42's "Sector-wide campaign" / "Include other employers"
-- switch OFF. The script refuses if sector_wide is on.
--
-- Production: add SET LOCAL oux.env = 'production'; immediately after BEGIN.

BEGIN;

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

DO $required_objects$
BEGIN
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '10 requires public._oux_hygiene_log (oux-wp0.4/00_create_hygiene_log.sql)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE campaign_id = 42) THEN
    RAISE EXCEPTION 'campaign 42 does not exist';
  END IF;
END;
$required_objects$;

DO $bounce_back_guard$
DECLARE
  v_sector boolean;
  v_ws_sector boolean;
  v_employers integer;
BEGIN
  SELECT sector_wide INTO v_sector
  FROM public.campaigns
  WHERE campaign_id = 42;

  SELECT EXISTS (
    SELECT 1 FROM public.campaign_worksites
    WHERE campaign_id = 42 AND sector_wide
  ) INTO v_ws_sector;

  SELECT count(*) INTO v_employers
  FROM public.campaign_employers
  WHERE campaign_id = 42;

  IF v_sector OR v_ws_sector THEN
    RAISE EXCEPTION
      'Refusing to run: campaign 42 is sector-wide (campaigns.sector_wide=%; worksite sector_wide=%). OR matching would add these workers back on the next wall-chart open. Turn the switch off, deploy the AND matcher, then re-run.',
      v_sector, v_ws_sector;
  END IF;
  IF v_employers = 0 THEN
    RAISE EXCEPTION
      'Refusing to run: campaign 42 has no campaign_employers rows, so every member would be removed';
  END IF;
END;
$bounce_back_guard$;

CREATE TEMP TABLE _c42_targets ON COMMIT DROP AS
SELECT
  cwm.membership_id,
  cwm.worker_id,
  cwm.created_at AS membership_created_at,
  w.employer_id,
  w.worksite_id
FROM public.campaign_worker_membership AS cwm
JOIN public.workers AS w ON w.worker_id = cwm.worker_id
WHERE cwm.campaign_id = 42
  AND (
    w.employer_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.campaign_employers AS ce
      WHERE ce.campaign_id = 42
        AND ce.employer_id = w.employer_id
    )
  );

DO $nonempty$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _c42_targets) THEN
    RAISE EXCEPTION 'No mismatched members on campaign 42; nothing to remove';
  END IF;
END;
$nonempty$;

CREATE TEMP TABLE _c42_placements ON COMMIT DROP AS
SELECT cwo.*
FROM public.campaign_worker_ou AS cwo
JOIN public.campaign_organising_units AS cou ON cou.ou_id = cwo.ou_id
JOIN _c42_targets AS t ON t.worker_id = cwo.worker_id
WHERE cou.campaign_id = 42;

CREATE TEMP TABLE _c42_list_items ON COMMIT DROP AS
SELECT i.id, i.list_id, i.worker_id, i.sort_order, i.source_ou_id, i.added_at
FROM public.campaign_worker_list_items AS i
JOIN public.campaign_worker_lists AS l ON l.list_id = i.list_id
JOIN _c42_targets AS t ON t.worker_id = i.worker_id
WHERE l.campaign_id = 42;

CREATE TEMP TABLE _c42_call_items ON COMMIT DROP AS
SELECT i.item_id, i.list_id, i.worker_id, i.sort_order, i.status, i.created_at
FROM public.call_list_items AS i
JOIN public.call_lists AS l ON l.list_id = i.list_id
JOIN _c42_targets AS t ON t.worker_id = i.worker_id
WHERE l.campaign_id = 42;

INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT
  'campaign_42_remove_wrong_employer_members',
  'delete',
  'campaign_worker_ou',
  jsonb_build_object('id', p.id),
  to_jsonb(p),
  NULL,
  'campaign 42: placement of worker whose employer is not in campaign_employers'
FROM _c42_placements AS p;

INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT
  'campaign_42_remove_wrong_employer_members',
  'delete',
  'campaign_worker_list_items',
  jsonb_build_object('id', i.id),
  to_jsonb(i),
  NULL,
  'campaign 42: list item for wrong-employer member'
FROM _c42_list_items AS i;

INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT
  'campaign_42_remove_wrong_employer_members',
  'delete',
  'call_list_items',
  jsonb_build_object('item_id', i.item_id),
  to_jsonb(i),
  NULL,
  'campaign 42: call-list item for wrong-employer member'
FROM _c42_call_items AS i;

INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT
  'campaign_42_remove_wrong_employer_members',
  'delete',
  'campaign_worker_membership',
  jsonb_build_object('membership_id', t.membership_id),
  jsonb_build_object(
    'membership_id', t.membership_id,
    'campaign_id', 42,
    'worker_id', t.worker_id,
    'created_at', t.membership_created_at,
    'employer_id', t.employer_id,
    'worksite_id', t.worksite_id
  ),
  NULL,
  'campaign 42: membership of worker whose employer is not in campaign_employers'
FROM _c42_targets AS t;

DELETE FROM public.campaign_worker_ou AS p
USING _c42_placements AS d
WHERE p.id = d.id;

DELETE FROM public.campaign_worker_list_items AS i
USING _c42_list_items AS d
WHERE i.id = d.id;

DELETE FROM public.call_list_items AS i
USING _c42_call_items AS d
WHERE i.item_id = d.item_id;

DELETE FROM public.campaign_worker_membership AS m
USING _c42_targets AS t
WHERE m.membership_id = t.membership_id;

SELECT
  '10_removed' AS result_set,
  (SELECT count(*) FROM _c42_targets) AS memberships_removed,
  (SELECT count(*) FROM _c42_placements) AS placements_removed,
  (SELECT count(*) FROM _c42_list_items) AS campaign_list_items_removed,
  (SELECT count(*) FROM _c42_call_items) AS call_list_items_removed,
  (SELECT count(*) FROM public.campaign_worker_membership WHERE campaign_id = 42) AS memberships_remaining,
  (SELECT count(*) FROM public._oux_hygiene_log
    WHERE script = 'campaign_42_remove_wrong_employer_members'
      AND rolled_back_at IS NULL) AS hygiene_rows_logged;

SELECT
  '10_removed_worker_ids' AS result_set,
  worker_id,
  employer_id,
  worksite_id
FROM _c42_targets
ORDER BY worker_id;

COMMIT;
