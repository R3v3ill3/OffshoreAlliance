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

// The taxonomy now lives in the baseline schema: the original
// 20260813120000_sms_source_taxonomy.sql moved to supabase/migrations_legacy/
// in the baseline repair, and the baseline is the live schema to assert against.
const MIGRATION = "supabase/migrations/20260908050000_baseline_schema.sql";
const ASSESSMENTS_ROUTE =
  "apps/organising-db/src/app/api/sms/conversations/[id]/assessments/route.ts";
const SURVEY_RUNTIME = "apps/organising-db/src/lib/sms/survey-runtime.ts";

const SPLIT_SOURCES = ["sms_chat", "sms_survey", "sms_inbound"] as const;

/**
 * Slice out just the declaration under test.
 *
 * The baseline schema is a ~33k-line pg_dump, so `text.slice(indexOf(needle))`
 * runs to the end of the file: every value declared *anywhere* after the anchor
 * satisfies a `toContain`, and the assertion proves nothing. Each slice below
 * is therefore closed at the first terminator that ends the declaration.
 */
function declaration(text: string, start: string, terminators: readonly string[]): string {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`"${start}" not found in ${MIGRATION}`);
  const rest = text.slice(from + start.length);
  const end = terminators.reduce((soFar, t) => {
    const at = rest.indexOf(t);
    return at >= 0 && at < soFar ? at : soFar;
  }, rest.length);
  return start + rest.slice(0, end);
}

// The CHECK is a single pg_dump table-constraint clause: the next "CONSTRAINT"
// starts the sibling clause, and ";" ends the CREATE TABLE.
const sourceCheck = (migration: string) =>
  declaration(migration, "campaign_activity_ratings_source_check", ["CONSTRAINT", ";"]);

// The trigger function's body is dollar-quoted; "$$;" closes it. Anchored on
// the schema-qualified name because the dump has ~500 CREATE OR REPLACE
// FUNCTION statements and the unanchored first one is not this function.
const ratingFn = (migration: string) =>
  declaration(
    migration,
    'CREATE OR REPLACE FUNCTION "public"."fn_sms_to_rating"',
    ["$$;"],
  );

describe("SMS rating source taxonomy", () => {
  const migration = read(MIGRATION);

  it("bounds each slice to the declaration it asserts on", () => {
    // Guards the guard: if either slice ever ran to the end of the file again,
    // these would fail, because each of these strings exists elsewhere in the
    // baseline but not inside the sliced declaration.
    const check = sourceCheck(migration);
    expect(check).not.toContain("inbound_keyword");
    expect(check).not.toContain("CREATE OR REPLACE FUNCTION");
    expect(check.length).toBeLessThan(2_000);

    const fn = ratingFn(migration);
    expect(fn).not.toContain("campaign_activity_ratings_source_check");
    expect(fn).not.toContain("an_report_import");
    expect(fn).toContain("RETURNS \"trigger\"");
    expect(fn.length).toBeLessThan(2_000);
  });

  it.each(SPLIT_SOURCES)(
    "allows %s in the campaign_activity_ratings source CHECK",
    (source) => {
      expect(sourceCheck(migration)).toContain(`'${source}'`);
    },
  );

  it("keeps the pre-split values so existing rows stay legal", () => {
    // Written against the UNION of both databases: PROD carries
    // an_sync / an_report_import, DEV did not. Dropping either would
    // fail the migration on PROD data.
    const check = sourceCheck(migration);
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
      expect(check).toContain(`'${legacy}'`);
    }
  });

  it("emits both trigger-side values from fn_sms_to_rating", () => {
    const fn = ratingFn(migration);
    expect(fn).toContain("'sms_survey'");
    expect(fn).toContain("'sms_inbound'");
    // The branch must key off the stamped origin, not the notes text.
    expect(fn).toContain("NEW.rating_origin = 'inbound_keyword'");
  });

  it("defaults unstamped rating rows to the survey pathway", () => {
    // The survey runtime is the only producer of rating-bearing
    // inbound rows today, so an unstamped row is a survey answer —
    // including in the window between this migration applying and the
    // stamping runtime deploying. A future keyword producer must
    // stamp 'inbound_keyword' to be counted as sms_inbound.
    const fn = ratingFn(migration);
    const branch = declaration(fn, "v_source := CASE", ["END;"]);
    expect(branch).toMatch(/ELSE\s+'sms_survey'/);
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
