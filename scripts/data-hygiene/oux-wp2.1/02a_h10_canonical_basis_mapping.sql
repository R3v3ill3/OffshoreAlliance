-- Operator mapping for C1 duplicate auto-fill bases.
-- Creates an empty table only; committed SQL contains no source IDs.
-- Populate canonical_ou_id from the reviewed H10 chooser output in 00.

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

CREATE TABLE IF NOT EXISTS public._oux_wp21_canonical_basis (
  mapping_id bigint GENERATED ALWAYS AS IDENTITY,
  campaign_id integer NOT NULL,
  fgk text NOT NULL CHECK (btrim(fgk) <> ''),
  employer_id integer,
  worksite_id integer,
  canonical_ou_id integer NOT NULL
    REFERENCES public.campaign_organising_units(ou_id) ON DELETE CASCADE,
  note text,
  CONSTRAINT _oux_wp21_canonical_basis_pkey PRIMARY KEY (mapping_id),
  CONSTRAINT _oux_wp21_canonical_basis_has_dimension
    CHECK (employer_id IS NOT NULL OR worksite_id IS NOT NULL)
);

ALTER TABLE public._oux_wp21_canonical_basis OWNER TO postgres;
ALTER SEQUENCE public._oux_wp21_canonical_basis_mapping_id_seq OWNER TO postgres;

-- PostgreSQL primary keys cannot contain expressions. This unique expression
-- index is the logical key approved by the plan and treats each NULL as 0;
-- employer/worksite IDs are positive in the source tables.
CREATE UNIQUE INDEX IF NOT EXISTS _oux_wp21_canonical_basis_key
  ON public._oux_wp21_canonical_basis (
    campaign_id,
    fgk,
    coalesce(employer_id, 0),
    coalesce(worksite_id, 0)
  );

ALTER TABLE public._oux_wp21_canonical_basis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._oux_wp21_canonical_basis FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public._oux_wp21_canonical_basis TO service_role;
REVOKE ALL ON SEQUENCE public._oux_wp21_canonical_basis_mapping_id_seq
  FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public._oux_wp21_canonical_basis_mapping_id_seq
  TO service_role;

COMMENT ON TABLE public._oux_wp21_canonical_basis IS
  'WP2.1 rehearsal/control metadata. Deleting its canonical unit cascades this mapping row so metadata cannot block full-mode unit or campaign deletion.';

COMMIT;

-- Template only; replace every placeholder from reviewed structural output:
-- INSERT INTO public._oux_wp21_canonical_basis
--   (campaign_id, fgk, employer_id, worksite_id, canonical_ou_id, note)
-- VALUES
--   (<campaign_id>, '<fgk>', <employer_id-or-null>, <worksite_id-or-null>,
--    <canonical_ou_id>, '<operator rationale>');

SELECT count(*) AS canonical_basis_mapping_rows
FROM public._oux_wp21_canonical_basis;
