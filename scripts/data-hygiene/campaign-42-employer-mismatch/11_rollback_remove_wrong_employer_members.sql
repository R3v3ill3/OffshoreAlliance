-- Restore rows deleted by 10_remove_wrong_employer_members.sql from
-- _oux_hygiene_log. Operator-run only. Not a migration.
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

DO $required$
BEGIN
  IF to_regclass('public._oux_hygiene_log') IS NULL THEN
    RAISE EXCEPTION '11 requires public._oux_hygiene_log';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public._oux_hygiene_log
    WHERE script = 'campaign_42_remove_wrong_employer_members'
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No active campaign_42_remove_wrong_employer_members log rows to roll back';
  END IF;
END;
$required$;

INSERT INTO public.campaign_worker_membership (membership_id, campaign_id, worker_id, created_at)
SELECT
  (l.before_row ->> 'membership_id')::integer,
  42,
  (l.before_row ->> 'worker_id')::integer,
  (l.before_row ->> 'created_at')::timestamptz
FROM public._oux_hygiene_log AS l
WHERE l.script = 'campaign_42_remove_wrong_employer_members'
  AND l.table_name = 'campaign_worker_membership'
  AND l.action = 'delete'
  AND l.rolled_back_at IS NULL
ON CONFLICT (membership_id) DO NOTHING;

INSERT INTO public.campaign_worker_ou
SELECT x.*
FROM public._oux_hygiene_log AS l
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.campaign_worker_ou, l.before_row) AS x
WHERE l.script = 'campaign_42_remove_wrong_employer_members'
  AND l.table_name = 'campaign_worker_ou'
  AND l.action = 'delete'
  AND l.rolled_back_at IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.campaign_worker_list_items (id, list_id, worker_id, sort_order, source_ou_id, added_at)
SELECT
  (l.before_row ->> 'id')::integer,
  (l.before_row ->> 'list_id')::integer,
  (l.before_row ->> 'worker_id')::integer,
  (l.before_row ->> 'sort_order')::integer,
  NULLIF(l.before_row ->> 'source_ou_id', '')::integer,
  (l.before_row ->> 'added_at')::timestamptz
FROM public._oux_hygiene_log AS l
WHERE l.script = 'campaign_42_remove_wrong_employer_members'
  AND l.table_name = 'campaign_worker_list_items'
  AND l.action = 'delete'
  AND l.rolled_back_at IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.call_list_items (item_id, list_id, worker_id, sort_order, status, created_at)
SELECT
  (l.before_row ->> 'item_id')::integer,
  (l.before_row ->> 'list_id')::integer,
  (l.before_row ->> 'worker_id')::integer,
  (l.before_row ->> 'sort_order')::integer,
  coalesce(l.before_row ->> 'status', 'pending'),
  (l.before_row ->> 'created_at')::timestamptz
FROM public._oux_hygiene_log AS l
WHERE l.script = 'campaign_42_remove_wrong_employer_members'
  AND l.table_name = 'call_list_items'
  AND l.action = 'delete'
  AND l.rolled_back_at IS NULL
ON CONFLICT (item_id) DO NOTHING;

UPDATE public._oux_hygiene_log
SET rolled_back_at = now()
WHERE script = 'campaign_42_remove_wrong_employer_members'
  AND rolled_back_at IS NULL;

SELECT
  '11_rollback' AS result_set,
  (SELECT count(*) FROM public.campaign_worker_membership WHERE campaign_id = 42) AS memberships_now,
  (SELECT count(*) FROM public._oux_hygiene_log
    WHERE script = 'campaign_42_remove_wrong_employer_members'
      AND rolled_back_at IS NOT NULL) AS hygiene_rows_rolled_back;

COMMIT;
