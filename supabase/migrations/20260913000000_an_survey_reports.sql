-- Action Network form/survey importer + AI report.
--
-- An "import" is one AN form or survey whose responses are loaded from a
-- downloaded CSV (AN's API does not expose response bodies). Each upload is a
-- batch; re-uploading a newer export replaces the current batch. Questions are
-- detected from the CSV columns and editable. Reports are AI narrative +
-- chart choices over app-computed aggregates; the app never stores AI-emitted
-- numbers.
--
-- campaign_id is nullable: NULL = standalone (Surveys & Forms section);
-- otherwise the import also appears under the campaign's Outcomes tab.
-- ON DELETE SET NULL keeps the survey data if a campaign is deleted.
--
-- RLS: org-wide SELECT (like every other org table). Writes follow the WP1.6
-- rule — get_user_role() IN ('admin','user') AND, when campaign-linked,
-- can_write_to_campaign(campaign_id). Child tables inherit the predicate
-- through their parent import.
--
-- Supabase db push wraps this file in one transaction; no explicit BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."an_survey_imports" (
  "id"                 "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
  "campaign_id"        integer REFERENCES "public"."campaigns"("campaign_id") ON DELETE SET NULL,
  "title"              "text" NOT NULL,
  "source_kind"        "text" NOT NULL DEFAULT 'form',
  "an_resource_type"   "text",
  "an_resource_id"     "text",
  "an_browser_url"     "text",
  "an_total_records"   integer,
  "an_last_synced_at"  timestamp with time zone,
  "current_batch_id"   "uuid",
  "current_report_id"  "uuid",
  "created_by"         "uuid" DEFAULT "auth"."uid"(),
  "created_at"         timestamp with time zone NOT NULL DEFAULT "now"(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "an_survey_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "an_survey_imports_source_kind_check"
    CHECK ("source_kind" = ANY (ARRAY['form'::"text", 'survey'::"text"])),
  CONSTRAINT "an_survey_imports_an_resource_type_check"
    CHECK ("an_resource_type" IS NULL OR "an_resource_type" = ANY (ARRAY['form'::"text", 'survey'::"text"])),
  CONSTRAINT "an_survey_imports_an_link_check"
    CHECK (("an_resource_type" IS NULL) = ("an_resource_id" IS NULL))
);

ALTER TABLE "public"."an_survey_imports" OWNER TO "postgres";

COMMENT ON TABLE "public"."an_survey_imports" IS
  'One Action Network form/survey whose responses are imported from a downloaded CSV. '
  'campaign_id NULL = standalone. current_batch_id / current_report_id point at the '
  'live data version and the latest generated report.';

CREATE UNIQUE INDEX IF NOT EXISTS "an_survey_imports_an_resource_uidx"
  ON "public"."an_survey_imports" ("an_resource_type", "an_resource_id")
  WHERE "an_resource_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "an_survey_imports_campaign_idx"
  ON "public"."an_survey_imports" ("campaign_id");

CREATE TABLE IF NOT EXISTS "public"."an_survey_import_batches" (
  "id"              "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
  "import_id"       "uuid" NOT NULL REFERENCES "public"."an_survey_imports"("id") ON DELETE CASCADE,
  "file_name"       "text",
  "headers"         "jsonb" NOT NULL DEFAULT '[]'::"jsonb",
  "row_count"       integer NOT NULL DEFAULT 0,
  "response_count"  integer NOT NULL DEFAULT 0,
  "duplicate_count" integer NOT NULL DEFAULT 0,
  "uploaded_by"     "uuid" DEFAULT "auth"."uid"(),
  "uploaded_at"     timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "an_survey_import_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."an_survey_import_batches" OWNER TO "postgres";

COMMENT ON TABLE "public"."an_survey_import_batches" IS
  'One row per CSV upload. Batch headers are kept for the audit trail; the '
  'response rows of superseded batches are deleted on refresh.';

CREATE INDEX IF NOT EXISTS "an_survey_import_batches_import_idx"
  ON "public"."an_survey_import_batches" ("import_id", "uploaded_at" DESC);

CREATE TABLE IF NOT EXISTS "public"."an_survey_responses" (
  "id"             "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
  "import_id"      "uuid" NOT NULL REFERENCES "public"."an_survey_imports"("id") ON DELETE CASCADE,
  "batch_id"       "uuid" NOT NULL REFERENCES "public"."an_survey_import_batches"("id") ON DELETE CASCADE,
  "row_index"      integer NOT NULL,
  "respondent_key" "text",
  "submitted_at"   timestamp with time zone,
  "is_latest"      boolean NOT NULL DEFAULT true,
  "data"           "jsonb" NOT NULL DEFAULT '{}'::"jsonb",
  CONSTRAINT "an_survey_responses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."an_survey_responses" OWNER TO "postgres";

COMMENT ON TABLE "public"."an_survey_responses" IS
  'Raw CSV rows of a batch (header -> trimmed value). is_latest is false for '
  'superseded duplicate submissions by the same respondent_key; aggregations '
  'read only is_latest rows of the import''s current batch.';

CREATE INDEX IF NOT EXISTS "an_survey_responses_batch_idx"
  ON "public"."an_survey_responses" ("batch_id");

CREATE INDEX IF NOT EXISTS "an_survey_responses_import_batch_latest_idx"
  ON "public"."an_survey_responses" ("import_id", "batch_id", "is_latest");

CREATE TABLE IF NOT EXISTS "public"."an_survey_questions" (
  "id"                "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
  "import_id"         "uuid" NOT NULL REFERENCES "public"."an_survey_imports"("id") ON DELETE CASCADE,
  "qkey"              "text" NOT NULL,
  "label"             "text" NOT NULL,
  "qtype"             "text" NOT NULL,
  "source_columns"    "text"[] NOT NULL DEFAULT '{}'::"text"[],
  "other_column"      "text",
  "options"           "jsonb" NOT NULL DEFAULT '[]'::"jsonb",
  "sort"              integer NOT NULL DEFAULT 0,
  "include_in_report" boolean NOT NULL DEFAULT true,
  "user_edited"       boolean NOT NULL DEFAULT false,
  "missing_since"     timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT "now"(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "an_survey_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "an_survey_questions_import_qkey_key" UNIQUE ("import_id", "qkey"),
  CONSTRAINT "an_survey_questions_qtype_check"
    CHECK ("qtype" = ANY (ARRAY['single_choice'::"text", 'multi_select'::"text", 'scale'::"text",
                                'free_text'::"text", 'identity'::"text", 'meta'::"text"]))
);

ALTER TABLE "public"."an_survey_questions" OWNER TO "postgres";

COMMENT ON TABLE "public"."an_survey_questions" IS
  'Detected (and user-editable) question schema for an import. source_columns '
  'lists the CSV column(s) behind the question (a Roles_* family for '
  'multi_select); other_column is the free-text "other" companion. '
  'missing_since is set when a refresh no longer carries the column(s).';

CREATE TABLE IF NOT EXISTS "public"."an_survey_reports" (
  "id"               "uuid" NOT NULL DEFAULT "gen_random_uuid"(),
  "import_id"        "uuid" NOT NULL REFERENCES "public"."an_survey_imports"("id") ON DELETE CASCADE,
  "batch_id"         "uuid" REFERENCES "public"."an_survey_import_batches"("id") ON DELETE SET NULL,
  "extraction_brief" "jsonb",
  "review"           "jsonb",
  "narrative"        "jsonb",
  "chart_spec"       "jsonb",
  "model"            "text",
  "input_tokens"     integer,
  "output_tokens"    integer,
  "generated_by"     "uuid" DEFAULT "auth"."uid"(),
  "generated_at"     timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "an_survey_reports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."an_survey_reports" OWNER TO "postgres";

COMMENT ON TABLE "public"."an_survey_reports" IS
  'One row per AI report generation. narrative/chart_spec are interpretation '
  'only (text + which charts to feature); every number is recomputed by the app '
  'from the responses. batch_id records which data version was analysed.';

CREATE INDEX IF NOT EXISTS "an_survey_reports_import_idx"
  ON "public"."an_survey_reports" ("import_id", "generated_at" DESC);

-- Parent pointers (added after the child tables exist).
ALTER TABLE "public"."an_survey_imports"
  ADD CONSTRAINT "an_survey_imports_current_batch_fkey"
  FOREIGN KEY ("current_batch_id") REFERENCES "public"."an_survey_import_batches"("id") ON DELETE SET NULL;

ALTER TABLE "public"."an_survey_imports"
  ADD CONSTRAINT "an_survey_imports_current_report_fkey"
  FOREIGN KEY ("current_report_id") REFERENCES "public"."an_survey_reports"("id") ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Write predicate helper — "may this user write this import?"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."can_write_an_survey_import"("p_import_id" "uuid")
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'pg_catalog', 'public'
AS $$
  SELECT
    "public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])
    AND EXISTS (
      SELECT 1 FROM "public"."an_survey_imports" i
      WHERE i."id" = "p_import_id"
        AND (i."campaign_id" IS NULL OR "public"."can_write_to_campaign"(i."campaign_id"))
    );
$$;

ALTER FUNCTION "public"."can_write_an_survey_import"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."can_write_an_survey_import"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."can_write_an_survey_import"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_write_an_survey_import"("uuid") TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."an_survey_imports"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."an_survey_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."an_survey_responses"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."an_survey_questions"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."an_survey_reports"        ENABLE ROW LEVEL SECURITY;

-- imports: org-wide read; admin/user write, campaign-scoped when linked.
CREATE POLICY "Authenticated can view an_survey_imports"
  ON "public"."an_survey_imports" FOR SELECT TO "authenticated"
  USING (true);

CREATE POLICY "Admin/User can insert an_survey_imports"
  ON "public"."an_survey_imports" FOR INSERT TO "authenticated"
  WITH CHECK (
    "public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])
    AND ("campaign_id" IS NULL OR "public"."can_write_to_campaign"("campaign_id"))
  );

CREATE POLICY "Admin/User can update an_survey_imports"
  ON "public"."an_survey_imports" FOR UPDATE TO "authenticated"
  USING (
    "public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])
    AND ("campaign_id" IS NULL OR "public"."can_write_to_campaign"("campaign_id"))
  )
  WITH CHECK (
    "public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])
    AND ("campaign_id" IS NULL OR "public"."can_write_to_campaign"("campaign_id"))
  );

CREATE POLICY "Admin/User can delete an_survey_imports"
  ON "public"."an_survey_imports" FOR DELETE TO "authenticated"
  USING (
    "public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])
    AND ("campaign_id" IS NULL OR "public"."can_write_to_campaign"("campaign_id"))
  );

-- child tables: same shape through the parent import.
CREATE POLICY "Authenticated can view an_survey_import_batches"
  ON "public"."an_survey_import_batches" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Admin/User can insert an_survey_import_batches"
  ON "public"."an_survey_import_batches" FOR INSERT TO "authenticated"
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can update an_survey_import_batches"
  ON "public"."an_survey_import_batches" FOR UPDATE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"))
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can delete an_survey_import_batches"
  ON "public"."an_survey_import_batches" FOR DELETE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"));

CREATE POLICY "Authenticated can view an_survey_responses"
  ON "public"."an_survey_responses" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Admin/User can insert an_survey_responses"
  ON "public"."an_survey_responses" FOR INSERT TO "authenticated"
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can update an_survey_responses"
  ON "public"."an_survey_responses" FOR UPDATE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"))
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can delete an_survey_responses"
  ON "public"."an_survey_responses" FOR DELETE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"));

CREATE POLICY "Authenticated can view an_survey_questions"
  ON "public"."an_survey_questions" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Admin/User can insert an_survey_questions"
  ON "public"."an_survey_questions" FOR INSERT TO "authenticated"
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can update an_survey_questions"
  ON "public"."an_survey_questions" FOR UPDATE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"))
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can delete an_survey_questions"
  ON "public"."an_survey_questions" FOR DELETE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"));

CREATE POLICY "Authenticated can view an_survey_reports"
  ON "public"."an_survey_reports" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Admin/User can insert an_survey_reports"
  ON "public"."an_survey_reports" FOR INSERT TO "authenticated"
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can update an_survey_reports"
  ON "public"."an_survey_reports" FOR UPDATE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"))
  WITH CHECK ("public"."can_write_an_survey_import"("import_id"));
CREATE POLICY "Admin/User can delete an_survey_reports"
  ON "public"."an_survey_reports" FOR DELETE TO "authenticated"
  USING ("public"."can_write_an_survey_import"("import_id"));

-- ---------------------------------------------------------------------------
-- 4. Grants — authenticated + service_role only, nothing to anon.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE "public"."an_survey_imports"        FROM PUBLIC, "anon";
REVOKE ALL ON TABLE "public"."an_survey_import_batches" FROM PUBLIC, "anon";
REVOKE ALL ON TABLE "public"."an_survey_responses"      FROM PUBLIC, "anon";
REVOKE ALL ON TABLE "public"."an_survey_questions"      FROM PUBLIC, "anon";
REVOKE ALL ON TABLE "public"."an_survey_reports"        FROM PUBLIC, "anon";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."an_survey_imports"        TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."an_survey_import_batches" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."an_survey_responses"      TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."an_survey_questions"      TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."an_survey_reports"        TO "authenticated";

GRANT ALL ON TABLE "public"."an_survey_imports"        TO "service_role";
GRANT ALL ON TABLE "public"."an_survey_import_batches" TO "service_role";
GRANT ALL ON TABLE "public"."an_survey_responses"      TO "service_role";
GRANT ALL ON TABLE "public"."an_survey_questions"      TO "service_role";
GRANT ALL ON TABLE "public"."an_survey_reports"        TO "service_role";

-- ---------------------------------------------------------------------------
-- 5. updated_at maintenance (baseline helper, see trg_campaigns_updated_at).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER "trg_an_survey_imports_updated_at"
  BEFORE UPDATE ON "public"."an_survey_imports"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE TRIGGER "trg_an_survey_questions_updated_at"
  BEFORE UPDATE ON "public"."an_survey_questions"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
