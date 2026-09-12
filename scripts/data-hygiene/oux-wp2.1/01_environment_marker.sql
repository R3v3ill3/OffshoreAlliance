-- WP2.1 persistent environment marker for clone/development cleanup runs.
-- Never run this file on production.
--
-- Before submitting, the operator must add exactly one of these lines
-- immediately after BEGIN in this same submission:
--   SET LOCAL oux.marker_env = 'clone';
--   SET LOCAL oux.marker_env = 'dev';
--
-- The committed file intentionally has no default. Running it unchanged stops.

BEGIN;

DO $guard$
DECLARE
  v_env text := current_setting('oux.marker_env', true);
BEGIN
  IF v_env IS DISTINCT FROM 'clone' AND v_env IS DISTINCT FROM 'dev' THEN
    RAISE EXCEPTION
      'Set oux.marker_env to clone or dev inside this transaction; refusing to create a marker';
  END IF;
END;
$guard$;

CREATE TABLE IF NOT EXISTS public._oux_env_marker (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  env text NOT NULL CHECK (env IN ('clone', 'dev')),
  marked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._oux_env_marker OWNER TO postgres;
ALTER TABLE public._oux_env_marker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._oux_env_marker FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public._oux_env_marker TO service_role;

INSERT INTO public._oux_env_marker (singleton, env)
VALUES (true, current_setting('oux.marker_env', true))
ON CONFLICT (singleton) DO UPDATE
SET env = EXCLUDED.env,
    marked_at = now();

DO $postcheck$
BEGIN
  IF (SELECT count(*) FROM public._oux_env_marker) <> 1
     OR EXISTS (
       SELECT 1
       FROM public._oux_env_marker
       WHERE env NOT IN ('clone', 'dev')
     )
  THEN
    RAISE EXCEPTION 'Environment marker post-check failed';
  END IF;
END;
$postcheck$;

COMMIT;

SELECT env, marked_at
FROM public._oux_env_marker;
