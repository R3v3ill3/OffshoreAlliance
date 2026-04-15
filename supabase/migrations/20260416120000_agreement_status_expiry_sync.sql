-- ============================================================
-- Agreement status vs expiry_date
-- ============================================================
-- Business rules (enforced here and in trg_fn_agreements_expiry_sets_expired):
--   - If expiry_date IS NOT NULL and expiry_date < CURRENT_DATE and status = 'Current',
--     set status to 'Expired'.
--   - Under_Negotiation, Terminated, and Expired are never auto-changed by this logic.
--   - NULL expiry_date: status is not auto-adjusted.
-- Backfill corrects existing rows. Trigger keeps rows consistent on writes.
-- Optional pg_cron job runs daily when the extension is present (e.g. hosted Supabase).

CREATE OR REPLACE FUNCTION public.sync_agreement_expired_status_by_date()
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.agreements
    SET status = 'Expired'
    WHERE expiry_date IS NOT NULL
      AND expiry_date < CURRENT_DATE
      AND status = 'Current'
    RETURNING agreement_id
  )
  SELECT count(*)::int FROM updated;
$$;

COMMENT ON FUNCTION public.sync_agreement_expired_status_by_date() IS
  'Sets status to Expired for agreements where expiry_date is in the past and status is still Current. Safe to run repeatedly (e.g. nightly pg_cron).';

REVOKE ALL ON FUNCTION public.sync_agreement_expired_status_by_date() FROM PUBLIC;

-- One-time alignment for existing data
SELECT public.sync_agreement_expired_status_by_date();

CREATE OR REPLACE FUNCTION public.trg_fn_agreements_expiry_sets_expired()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expiry_date IS NOT NULL
     AND NEW.expiry_date < CURRENT_DATE
     AND NEW.status = 'Current' THEN
    NEW.status := 'Expired';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_agreements_expiry_sets_expired() IS
  'BEFORE INSERT/UPDATE: sets status to Expired when expiry_date is in the past and status is Current.';

CREATE TRIGGER trg_agreements_expiry_status
  BEFORE INSERT OR UPDATE ON public.agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_agreements_expiry_sets_expired();

-- Daily sync for rows that become stale without an UPDATE (trigger only runs on write).
DO $cron$
DECLARE
  jid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping schedule for sync_agreement_expired_status_by_date (local dev is fine).';
    RETURN;
  END IF;

  SELECT j.jobid INTO jid
  FROM cron.job j
  WHERE j.jobname = 'agreement_status_expire_by_date'
  LIMIT 1;

  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;

  PERFORM cron.schedule(
    'agreement_status_expire_by_date',
    '5 0 * * *',
    $sql$SELECT public.sync_agreement_expired_status_by_date()$sql$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped for agreement_status_expire_by_date: %', SQLERRM;
END
$cron$;
