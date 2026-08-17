import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

/**
 * Phase 12 (§F decision 9) splits campaign_activity_ratings.source
 * 'sms' into sms_chat / sms_survey / sms_inbound.
 *
 * The brief flags a live precedent for getting this wrong: the phone
 * split is broken because 20260613110000_outcome_model.sql migrated
 * rows to 'phone_call_live' while record_call_attempt() kept writing
 * 'call_outcome' — a schema and its producers drifting apart with
 * nothing to catch it. §F's instruction is explicit: "whatever
 * taxonomy is chosen must be written by every producer, and a test
 * should assert it."
 *
 * That assertion cannot be made against behaviour here: one producer
 * is a Postgres trigger and the other is a route calling a SECURITY
 * DEFINER RPC, so neither is reachable without a live database. What
 * IS checkable without one is that the schema and every producer
 * still agree on the vocabulary — which is precisely the failure mode
 * the phone split demonstrates. These tests read the shipped files.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../../../..");
const repoRoot = resolve(appRoot, "../..");

const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

const MIGRATION = "supabase/migrations/20260813120000_sms_source_taxonomy.sql";
const ASSESSMENTS_ROUTE =
  "apps/organising-db/src/app/api/sms/conversations/[id]/assessments/route.ts";
const SURVEY_RUNTIME = "apps/organising-db/src/lib/sms/survey-runtime.ts";

const SPLIT_SOURCES = ["sms_chat", "sms_survey", "sms_inbound"] as const;

describe("SMS rating source taxonomy", () => {
  const migration = read(MIGRATION);

  it.each(SPLIT_SOURCES)(
    "allows %s in the campaign_activity_ratings source CHECK",
    (source) => {
      const check = migration.slice(
        migration.indexOf("campaign_activity_ratings_source_check"),
      );
      expect(check).toContain(`'${source}'`);
    },
  );

  it("keeps the pre-split values so existing rows stay legal", () => {
    // Written against the UNION of both databases: PROD carries
    // an_sync / an_report_import, DEV did not. Dropping either would
    // fail the migration on PROD data.
    for (const legacy of [
      "call_outcome",
      "phone_call_live",
      "phone_call_share_link",
      "door_knock",
      "task_assignment",
      "task_completion",
      "task_take",
      "staff",
      "leader_form",
      "sms",
      "email",
      "petition",
      "meeting",
      "an_sync",
      "an_report_import",
    ]) {
      expect(migration).toContain(`'${legacy}'`);
    }
  });

  it("emits both trigger-side values from fn_sms_to_rating", () => {
    const fn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(fn).toContain("'sms_survey'");
    expect(fn).toContain("'sms_inbound'");
    // The branch must key off the stamped origin, not the notes text.
    expect(fn).toContain("NEW.rating_origin = 'survey'");
  });

  it("records staff capture in the inbox as sms_chat", () => {
    const route = read(ASSESSMENTS_ROUTE);
    expect(route).toContain("p_source: 'sms_chat'");
    // The old undifferentiated value must be gone from the write path.
    expect(route).not.toContain("p_source: 'sms'");
  });

  it("stamps rating_origin on survey-produced interactions", () => {
    // Without this the trigger cannot tell a survey answer from a
    // keyword-mapped reply, and every survey rating lands as
    // sms_inbound.
    expect(read(SURVEY_RUNTIME)).toContain('rating_origin: "survey"');
  });

  it("leaves no producer still writing the undifferentiated value", () => {
    for (const file of [ASSESSMENTS_ROUTE, SURVEY_RUNTIME]) {
      expect(read(file)).not.toMatch(/p_source\s*:=?\s*['"]sms['"]/);
    }
  });
});
