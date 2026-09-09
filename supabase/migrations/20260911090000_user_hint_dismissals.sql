-- WP1.7 — per-user first-use hint dismissals (docs/organiser-ux-review/wp/wp1.7.md §2.3.4).
--
-- Why its own table and not user_profiles.workspace_prefs: the admin write
-- path (apps/organising-db/src/app/api/admin/update-user/route.ts:161)
-- REPLACES workspace_prefs with a .strict()-parsed
-- {mode, modules, allowShowEverything} document, so any extra key an admin
-- edit touches is destroyed. Hint state has exactly one legitimate writer —
-- its owner — so it gets a table whose RLS says that.
--
-- Presentation only: nothing here grants or removes any data access. No RPC,
-- no SECURITY DEFINER function — with an owner-only table the RLS predicate
-- IS the scope.
--
-- Policy naming follows the baseline's "Users can … own …" convention
-- (20260908050000_baseline_schema.sql:27875, :27887). Shape precedent:
-- rate_limit_usage / rate_limit_config (baseline :13575-13586).

CREATE TABLE IF NOT EXISTS "public"."user_hint_dismissals" (
  "user_id"      "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "hint_id"      "text" NOT NULL,
  "dismissed_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "user_hint_dismissals_pkey" PRIMARY KEY ("user_id", "hint_id")
);

ALTER TABLE "public"."user_hint_dismissals" OWNER TO "postgres";

COMMENT ON TABLE "public"."user_hint_dismissals" IS
  'WP1.7: one row per (user, first-use hint) once the user dismisses it. '
  'hint_id is an app-side registry id (apps/organising-db/src/lib/hints/registry.ts), '
  'deliberately un-enumerated in SQL so adding a hint needs no migration. Owner-only.';

ALTER TABLE "public"."user_hint_dismissals" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hint dismissals"
  ON "public"."user_hint_dismissals" FOR SELECT TO "authenticated"
  USING ("user_id" = "auth"."uid"());

CREATE POLICY "Users can insert own hint dismissals"
  ON "public"."user_hint_dismissals" FOR INSERT TO "authenticated"
  WITH CHECK ("user_id" = "auth"."uid"());

-- DELETE is granted deliberately: it is the reset the e2e spec needs
-- (tests/e2e/wall-chart.spec.ts), and the worst a user can do with it is
-- give themselves the hint back.
CREATE POLICY "Users can delete own hint dismissals"
  ON "public"."user_hint_dismissals" FOR DELETE TO "authenticated"
  USING ("user_id" = "auth"."uid"());

-- Narrower than the baseline's blanket grants on purpose: no UPDATE (a
-- dismissal has nothing to amend — delete and re-insert), and nothing to anon.
REVOKE ALL ON TABLE "public"."user_hint_dismissals" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."user_hint_dismissals" FROM "anon";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."user_hint_dismissals" TO "authenticated";
GRANT ALL ON TABLE "public"."user_hint_dismissals" TO "service_role";
