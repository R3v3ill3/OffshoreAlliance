-- Admin-managed list of who receives mobilisation email, push and digests.
-- Seeded from current admin/user profiles so existing delivery does not drop.

CREATE TABLE IF NOT EXISTS "public"."mobilisation_recipients" (
  "user_id" uuid PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobilisation_recipients_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."mobilisation_recipients" IS
  'Staff who may receive mobilisation alerts. Admins pick the list; each person still controls email, push and digest on their own prefs.';

DROP TRIGGER IF EXISTS "trg_mobilisation_recipients_updated_at" ON "public"."mobilisation_recipients";
CREATE TRIGGER "trg_mobilisation_recipients_updated_at"
  BEFORE UPDATE ON "public"."mobilisation_recipients"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

INSERT INTO "public"."mobilisation_recipients" ("user_id", "enabled")
SELECT "user_id", true
FROM "public"."user_profiles"
WHERE "role" IN ('admin', 'user')
ON CONFLICT ("user_id") DO NOTHING;

ALTER TABLE "public"."mobilisation_recipients" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."mobilisation_recipients" FROM PUBLIC, anon;
GRANT SELECT ON TABLE "public"."mobilisation_recipients" TO authenticated;
GRANT ALL ON TABLE "public"."mobilisation_recipients" TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE "public"."mobilisation_recipients" TO authenticated;

CREATE POLICY "mobilisation read recipients" ON "public"."mobilisation_recipients"
  FOR SELECT TO "authenticated"
  USING (
    "user_id" = auth.uid()
    OR "public"."get_user_role"() = 'admin'
  );

CREATE POLICY "mobilisation admin write recipients" ON "public"."mobilisation_recipients"
  FOR ALL TO "authenticated"
  USING ("public"."get_user_role"() = 'admin')
  WITH CHECK ("public"."get_user_role"() = 'admin');
