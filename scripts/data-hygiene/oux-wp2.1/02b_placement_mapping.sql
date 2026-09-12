-- Optional operator overrides for unresolved future-group placement conflicts.
-- Creates an empty table only; committed SQL contains no source IDs.
-- keep_ou_id NULL means remove every placement in that mapped partition.

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

CREATE TABLE IF NOT EXISTS public._oux_wp21_placement_mapping (
  campaign_id integer NOT NULL,
  fgk text NOT NULL CHECK (btrim(fgk) <> ''),
  worker_id integer NOT NULL,
  keep_ou_id integer
    REFERENCES public.campaign_organising_units(ou_id) ON DELETE CASCADE,
  note text,
  CONSTRAINT _oux_wp21_placement_mapping_pkey
    PRIMARY KEY (campaign_id, fgk, worker_id)
);

ALTER TABLE public._oux_wp21_placement_mapping OWNER TO postgres;
ALTER TABLE public._oux_wp21_placement_mapping ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._oux_wp21_placement_mapping FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public._oux_wp21_placement_mapping TO service_role;

COMMENT ON TABLE public._oux_wp21_placement_mapping IS
  'WP2.1 rehearsal/control metadata. Deleting a non-NULL keeper unit cascades its mapping row; it never turns keep-this-unit into remove-all and cannot block full-mode deletion.';

COMMIT;

-- Template only; replace placeholders from reviewed H9/resolution output:
-- INSERT INTO public._oux_wp21_placement_mapping
--   (campaign_id, fgk, worker_id, keep_ou_id, note)
-- VALUES
--   (<campaign_id>, '<fgk>', <worker_id>, <keep_ou_id-or-null>,
--    '<operator rationale>');

SELECT count(*) AS placement_mapping_rows
FROM public._oux_wp21_placement_mapping;
