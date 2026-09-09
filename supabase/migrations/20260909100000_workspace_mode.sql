-- WP1.1 — module registry and workspace mode.
-- 1) Per-user overrides on user_profiles (baseline:9887-9899).
-- 2) A non-admin read path for the org-wide defaults held in app_settings
--    (app_settings SELECT is admin-only — baseline:25841-25845).
--
-- Workspace mode is presentation, never permission: nothing here changes
-- any RLS policy or grants any data access. No row is seeded — an absent
-- 'workspace_defaults' key resolves to "full for everyone" in the app.

ALTER TABLE "public"."user_profiles"
  ADD COLUMN IF NOT EXISTS "workspace_prefs" "jsonb" NOT NULL DEFAULT '{}'::"jsonb";

COMMENT ON COLUMN "public"."user_profiles"."workspace_prefs" IS
  'WP1.1 workspace mode: per-user override of the org-wide defaults in '
  'app_settings.workspace_defaults. Shape {"mode":"full"|"organiser",'
  '"modules":[<module id>,...],"allowShowEverything":boolean} — every key optional; '
  '{} means "follow the default for my work role". Presentation only: it never '
  'grants or removes any data permission (RLS is unchanged).';

-- Narrow, auditable reader. SECURITY DEFINER (owner postgres) so a user/viewer
-- client can read this ONE key without app_settings SELECT being widened.
-- Returns '{}'::jsonb when the key is absent, empty or not valid JSON, so a bad
-- stored value degrades to "full for everyone" instead of erroring the client.
CREATE OR REPLACE FUNCTION "public"."get_workspace_defaults"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_raw text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  SELECT value INTO v_raw FROM public.app_settings WHERE key = 'workspace_defaults';
  IF v_raw IS NULL OR btrim(v_raw) = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN v_raw::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$$;

ALTER FUNCTION "public"."get_workspace_defaults"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_workspace_defaults"() IS
  'WP1.1: returns the app_settings.workspace_defaults document (or {}) to any '
  'authenticated user. Reads exactly this one key; app_settings RLS is unchanged.';

-- Deliberately narrower than the baseline's blanket GRANT ALL ... TO anon:
-- anon must not be able to probe org configuration.
REVOKE ALL ON FUNCTION "public"."get_workspace_defaults"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_workspace_defaults"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_workspace_defaults"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_workspace_defaults"() TO "service_role";
