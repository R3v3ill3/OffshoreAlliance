import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSpreadsheet } from "@/lib/import/parse-spreadsheet";
import { aggregate, candidateCrossTabPairs, crossTab, knownNumbers, pct } from "../aggregate";
import { dedupeResponses, detectIdentityColumns } from "../dedupe";
import { numberGuard } from "../number-guard";
import { scrubText } from "../pii";
import { detectSchema, mergeDetectedSchema } from "../schema-detect";
import { generateOutputSchema, sanitiseGenerateOutput } from "../schemas";
import { parseSubmittedAt, zoneFromHeader } from "../timestamp";
import type { DetectedQuestion } from "../types";

const FIXTURE = join(__dirname, "fixtures", "rov-form.synthetic.csv");

function loadFixture() {
  const buffer = readFileSync(FIXTURE);
  return parseSpreadsheet(buffer, "rov-form.synthetic.csv");
}

describe("parseSpreadsheet", () => {
  it("parses the AN export, trims cells and keeps every row", () => {
    const parsed = loadFixture();
    expect(parsed.headers).toHaveLength(27);
    expect(parsed.headers[0]).toBe("First Name");
    expect(parsed.rows).toHaveLength(12);
    // Trailing spaces in the source are trimmed by the parser.
    expect(parsed.rows[0]["First Name"]).toBe("Alex");
    expect(parsed.rows[0]["notes"]).toBe("First submission");
  });

  it("rejects unsupported files and oversize buffers", () => {
    expect(() => parseSpreadsheet(Buffer.from("a,b\n1,2"), "x.txt")).toThrow(/Only \.csv/);
    expect(() => parseSpreadsheet(Buffer.alloc(11), "x.csv", { maxBytes: 10 })).toThrow(/larger than/);
  });
});

describe("detectSchema", () => {
  const parsed = loadFixture();
  const questions = detectSchema(parsed.headers, parsed.rows);
  const byLabel = (label: string) => questions.find((q) => q.label === label)!;

  it("groups the Roles_* family into one multi_select with Roles_other as the other column", () => {
    const roles = byLabel("Roles");
    expect(roles).toBeDefined();
    expect(roles.qtype).toBe("multi_select");
    expect(roles.source_columns).toHaveLength(6);
    expect(roles.other_column).toBe("Roles_other");
    expect(roles.options.map((o) => o.label)).toContain("ROV Pilot Technician Grade 1");
    expect(roles.options.at(-1)).toEqual({ key: "__other__", label: "Other (specified)" });
    expect(questions.filter((q) => q.source_columns.some((c) => c.startsWith("Roles_")))).toHaveLength(1);
  });

  it("classifies the single-choice questions and keeps long dash labels intact", () => {
    expect(byLabel("Availability").qtype).toBe("single_choice");
    expect(byLabel("Kystdesign").qtype).toBe("single_choice");
    expect(byLabel("OA member").qtype).toBe("single_choice");
    const labels = byLabel("Availability").options.map((o) => o.label);
    expect(labels).toContain("Highly probable — subject to wages & conditions");
    // "Definite - available and ready" (plain dash) merges with the em-dash spelling.
    expect(labels.filter((l) => l.startsWith("Definite"))).toHaveLength(1);
    // Yes / yes / YES merge to one option.
    expect(byLabel("Kystdesign").options).toHaveLength(3);
    expect(byLabel("OA member").options.map((o) => o.label)).toContain("No - but I'd like to join");
  });

  it("marks free text, identity and meta columns", () => {
    expect(byLabel("notes").qtype).toBe("free_text");
    expect(byLabel("quals").qtype).toBe("free_text");
    expect(byLabel("Email").qtype).toBe("identity");
    expect(byLabel("First Name").qtype).toBe("identity");
    expect(byLabel("Mobile Number").qtype).toBe("identity");
    expect(byLabel("Address").qtype).toBe("meta");
    expect(byLabel("Address").include_in_report).toBe(false);
    expect(byLabel("Referrer Code").qtype).toBe("meta");
    expect(byLabel("Timestamp (ET)").qtype).toBe("meta");
    expect(byLabel("Language").qtype).toBe("meta");
  });

  it("offers Country as a promotable breakdown, off by default", () => {
    const country = byLabel("Country");
    expect(country.qtype).toBe("meta");
    expect(country.include_in_report).toBe(false);
    expect(country.options.map((o) => o.label).sort()).toEqual(["AU", "DE", "GB", "NZ"]);
  });

  it("produces unique qkeys and stable sort order", () => {
    const keys = questions.map((q) => q.qkey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(questions.map((q) => q.sort)).toEqual(questions.map((_, i) => i));
  });

  it("merges a refresh: keeps stored rows, appends new columns, flags missing ones", () => {
    const stored = questions.map((q) => ({ ...q, user_edited: q.label === "Availability", missing_since: null }));
    const newHeaders = [...parsed.headers.filter((h) => h !== "quals"), "New question"];
    const detected = detectSchema(newHeaders, parsed.rows.map((r) => ({ ...r, "New question": "A" })));
    const merged = mergeDetectedSchema(stored, detected, newHeaders);
    expect(merged.missing.map((q) => q.label)).toEqual(["quals"]);
    expect(merged.add.map((q) => q.label)).toEqual(["New question"]);
    expect(merged.keep.find((q) => q.label === "Availability")?.user_edited).toBe(true);
  });
});

describe("dedupeResponses", () => {
  const parsed = loadFixture();
  const { rows, summary, identity } = dedupeResponses(parsed.headers, parsed.rows);

  it("finds the identity columns", () => {
    expect(identity.email).toBe("Email");
    expect(identity.phone).toBe("Mobile Number");
    expect(identity.first).toBe("First Name");
    expect(identity.last).toBe("Last Name");
    expect(identity.timestamp).toBe("Timestamp (ET)");
    expect(detectIdentityColumns(["email", "mobile_number", "first_name"]).phone).toBe("mobile_number");
  });

  it("collapses repeat submissions to the latest one", () => {
    expect(summary.rowCount).toBe(12);
    expect(summary.responseCount).toBe(9);
    expect(summary.duplicateCount).toBe(3);
    expect(summary.duplicates.map((d) => d.count).sort()).toEqual([2, 3]);
    const alex = rows.filter((r) => r.respondent_key === "e:alex.tester@example.com");
    expect(alex).toHaveLength(3);
    const latest = alex.find((r) => r.is_latest)!;
    expect(latest.data["notes"]).toBe("Third and latest");
    const bea = rows.filter((r) => r.respondent_key === "e:bea@example.org").find((r) => r.is_latest)!;
    expect(bea.data["Availability"]).toBe("Definite — available and ready");
  });

  it("falls back to a name key when no email or phone is present", () => {
    const chris = rows.find((r) => r.data["First Name"] === "Chris")!;
    expect(chris.respondent_key).toMatch(/^n:/);
    expect(chris.is_latest).toBe(true);
  });

  it("parses ET timestamps to UTC", () => {
    const first = rows[0];
    // 2026-09-09 22:47:42 EDT (UTC-4) → 2026-09-10T02:47:42Z
    expect(first.submitted_at).toBe("2026-09-10T02:47:42.000Z");
    expect(summary.unparsedTimestamps).toBe(0);
  });
});

describe("timestamp", () => {
  it("reads the zone from the header and the cell", () => {
    expect(zoneFromHeader("Timestamp (ET)")).toBe("America/New_York");
    expect(zoneFromHeader("Timestamp")).toBeNull();
    expect(parseSubmittedAt("2026-01-15 09:00:00 ET")).toBe("2026-01-15T14:00:00.000Z"); // EST
    expect(parseSubmittedAt("2026-07-15 09:00:00 ET")).toBe("2026-07-15T13:00:00.000Z"); // EDT
    expect(parseSubmittedAt("2026-07-15 09:00:00", "Australia/Perth")).toBe("2026-07-15T01:00:00.000Z");
    expect(parseSubmittedAt("2026-07-15T09:00:00Z")).toBe("2026-07-15T09:00:00.000Z");
    expect(parseSubmittedAt("2026-07-15T09:00:00+10:00")).toBe("2026-07-14T23:00:00.000Z");
    expect(parseSubmittedAt("not a date")).toBeNull();
    expect(parseSubmittedAt("")).toBeNull();
  });
});

describe("aggregate", () => {
  const parsed = loadFixture();
  const questions = detectSchema(parsed.headers, parsed.rows);
  const deduped = dedupeResponses(parsed.headers, parsed.rows);
  const latest = deduped.rows
    .filter((r) => r.is_latest)
    .map((r) => ({
      row_index: r.row_index,
      data: r.data,
      name_tokens: [r.data["First Name"], r.data["Last Name"]],
    }));
  const q = (label: string) => questions.find((x) => x.label === label)!;
  const agg = aggregate(questions, latest, {
    crossTabs: [{ row_qkey: q("Roles").qkey, col_qkey: q("Availability").qkey }],
    headline: { submissions: 12, respondents: 9, duplicates: 3 },
  });
  const get = (label: string) => agg.questions.find((a) => a.qkey === q(label).qkey)!;

  it("counts single-choice answers over answered respondents and reports blanks", () => {
    const avail = get("Availability");
    expect(avail.qtype).toBe("single_choice");
    if (avail.qtype !== "single_choice") throw new Error();
    expect(avail.n_answered).toBe(8);
    expect(avail.no_answer).toBe(1);
    const total = avail.options.reduce((s, o) => s + o.count, 0);
    expect(total).toBe(8);
    const pctSum = avail.options.reduce((s, o) => s + o.pct, 0);
    expect(Math.abs(pctSum - 100)).toBeLessThan(0.5);
    expect(avail.options.find((o) => o.label.startsWith("Definite"))?.count).toBe(3);
  });

  it("merges case variants into one option", () => {
    const k = get("Kystdesign");
    if (k.qtype !== "single_choice") throw new Error();
    expect(k.options.find((o) => o.key === "yes")?.count).toBe(1); // Finn ("yes"); Alex's latest says Similar systems
    expect(k.options).toHaveLength(3);
  });

  it("tallies multi-select per respondent and captures other texts", () => {
    const roles = get("Roles");
    if (roles.qtype !== "multi_select") throw new Error();
    expect(roles.n_respondents).toBe(9);
    expect(roles.none_selected).toBe(1); // Ivy
    const g1 = roles.options.find((o) => o.label === "ROV Pilot Technician Grade 1")!;
    expect(g1.count).toBe(2); // Bea (latest) + Eli — Alex's latest has no Grade 1
    expect(g1.pct).toBe(pct(2, 9));
    expect(roles.other_texts).toEqual(["Shift / Bridge Supervisor"]);
    expect(roles.options.find((o) => o.key === "__other__")?.count).toBe(1);
  });

  it("scrubs PII out of free text and computes top terms", () => {
    const notes = get("notes");
    if (notes.qtype !== "free_text") throw new Error();
    const beaNote = notes.responses.find((r) => r.text.includes("Changed my mind"))!;
    expect(beaNote.text).not.toContain("0400 111 222");
    expect(beaNote.text).not.toContain("bea@example.org");
    expect(beaNote.text).toContain("[phone]");
    expect(beaNote.text).toContain("[email]");
    const dana = notes.responses.find((r) => r.text.includes("details"))!;
    expect(dana.text).toContain("[link]");
    expect(notes.n_answered).toBe(4); // Alex, Bea, Dana, Ivy
  });

  it("cross-tabulates multi-select rows against single-choice columns", () => {
    const ct = agg.crosstabs[0];
    expect(ct).toBeDefined();
    expect(ct.n).toBe(7); // answered both: 8 with availability minus Ivy (no roles)
    const rowIdx = ct.row_options.findIndex((o) => o.label === "ROV Supervisor");
    const colIdx = ct.col_options.findIndex((o) => o.label.startsWith("Definite"));
    expect(ct.cells[rowIdx][colIdx]).toBe(1); // Bea latest
    expect(ct.row_totals[rowIdx]).toBe(5); // Alex, Bea, Chris, Finn, Hana
    const direct = crossTab(q("Roles"), q("Availability"), latest);
    expect(direct.cells).toEqual(ct.cells);
  });

  it("never aggregates identity or unpromoted meta columns", () => {
    expect(agg.questions.find((a) => a.qkey === q("Email").qkey)).toBeUndefined();
    expect(agg.questions.find((a) => a.qkey === q("Country").qkey)).toBeUndefined();
    const promoted = aggregate(
      questions.map((x) => (x.label === "Country" ? { ...x, include_in_report: true } : x)),
      latest
    );
    const country = promoted.questions.find((a) => a.qkey === q("Country").qkey);
    expect(country?.qtype).toBe("single_choice");
    if (country?.qtype === "single_choice") {
      expect(country.options.find((o) => o.label === "AU")?.count).toBe(5);
    }
  });

  it("lists candidate cross-tab pairs among choice-like questions only", () => {
    const pairs = candidateCrossTabPairs(questions);
    // Roles, Availability, Kystdesign, OA member → 6 pairs
    expect(pairs).toHaveLength(6);
  });

  it("collects the set of known numbers for the guard", () => {
    const known = knownNumbers(agg);
    expect(known.has("12")).toBe(true);
    expect(known.has("9")).toBe(true);
    expect(known.has("3")).toBe(true);
  });
});

describe("number guard + sanitise", () => {
  it("flags figures that were not computed by the app", () => {
    const known = new Set(["9", "3", "33.3", "12"]);
    const warnings = numberGuard(
      {
        headline: "Nine of 12 people are ready",
        summary: "About 73% said yes, 3 people did not answer, in 2026.",
        per_question: [{ qkey: "avail", insight: "A clear majority — 33.3% chose definite." }],
        crosstab_insights: [],
        free_text_summaries: [],
        caveats: [],
      },
      known
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("73%");
    expect(warnings[0]).not.toContain("2026");
  });

  it("drops chart sections and insights that point at unknown questions", () => {
    const parsedOut = generateOutputSchema.parse({
      narrative: {
        headline: "h",
        summary: "s",
        per_question: [
          { qkey: "availability", insight: "ok" },
          { qkey: "ghost", insight: "dropped" },
        ],
        crosstab_insights: [{ row_qkey: "roles", col_qkey: "ghost", insight: "dropped" }],
        free_text_summaries: [{ qkey: "notes", summary: "themes" }],
        caveats: [],
      },
      chart_spec: {
        sections: [
          { kind: "question", qkey: "availability", chart: "bar", emphasis: "lead" },
          { kind: "question", qkey: "availability", chart: "pie", emphasis: "normal" },
          { kind: "question", qkey: "notes", chart: "bar", emphasis: "normal" },
          { kind: "crosstab", row_qkey: "roles", col_qkey: "roles", chart: "table" },
          { kind: "free_text", qkey: "notes", themes: [{ label: "Pay", row_ids: [1, 1, 2] }, { label: "Empty", row_ids: [] }] },
        ],
      },
    });
    const result = sanitiseGenerateOutput(parsedOut, new Set(["availability", "roles", "notes"]), new Set(["notes"]));
    expect(result.chart_spec.sections).toHaveLength(2);
    expect(result.chart_spec.sections[0]).toMatchObject({ kind: "question", qkey: "availability", chart: "bar" });
    const ft = result.chart_spec.sections[1];
    expect(ft.kind).toBe("free_text");
    if (ft.kind === "free_text") {
      expect(ft.themes).toEqual([{ label: "Pay", row_ids: [1, 2] }]);
    }
    expect(result.narrative.per_question).toHaveLength(1);
    expect(result.narrative.crosstab_insights).toHaveLength(0);
    expect(result.dropped.length).toBeGreaterThanOrEqual(3);
  });
});

describe("AI output schemas vs Anthropic structured outputs", () => {
  it("carry no length constraints (the API ignores them and the SDK would then reject valid replies)", async () => {
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
    const { reviewOutputSchema: r, generateOutputSchema: g } = await import("../schemas");
    for (const schema of [r, g]) {
      const json = JSON.stringify(zodOutputFormat(schema));
      expect(json).not.toMatch(/"maxItems"|"minItems"|"maxLength"|"minLength"/);
    }
  });

  it("accepts seven clarifying questions and clamps them to six afterwards", async () => {
    const { reviewOutputSchema: r, clampReviewOutput, AI_OUTPUT_LIMITS } = await import("../schemas");
    const parsed = r.parse({
      summary: "s",
      schema_suggestions: [],
      data_quality_notes: Array.from({ length: 20 }, (_, i) => `note ${i}`),
      clarifying_questions: Array.from({ length: 7 }, (_, i) => ({
        id: `q${i}`,
        question: `Question ${i}?`,
        kind: i % 2 ? "text" : "single",
        options: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      })),
    });
    const clamped = clampReviewOutput(parsed);
    expect(clamped.clarifying_questions).toHaveLength(AI_OUTPUT_LIMITS.clarifyingQuestions);
    expect(clamped.data_quality_notes).toHaveLength(AI_OUTPUT_LIMITS.dataQualityNotes);
    // text questions carry no options; single-choice options are capped
    expect(clamped.clarifying_questions[1].options).toEqual([]);
    expect(clamped.clarifying_questions[0].options).toHaveLength(AI_OUTPUT_LIMITS.clarifyingOptions);
  });

  it("clamps generate output sizes without touching valid content", async () => {
    const { generateOutputSchema: g, clampGenerateOutput, AI_OUTPUT_LIMITS } = await import("../schemas");
    const parsed = g.parse({
      narrative: {
        headline: "h",
        summary: "x".repeat(5000),
        per_question: [{ qkey: "a", insight: "fine" }],
        crosstab_insights: [],
        free_text_summaries: [],
        caveats: Array.from({ length: 15 }, () => "c"),
      },
      chart_spec: {
        sections: [
          { kind: "free_text", qkey: "notes", themes: Array.from({ length: 15 }, (_, i) => ({ label: `t${i}`, row_ids: [i] })) },
        ],
      },
    });
    const c = clampGenerateOutput(parsed);
    expect(c.narrative.summary.length).toBeLessThanOrEqual(AI_OUTPUT_LIMITS.summaryText);
    expect(c.narrative.caveats).toHaveLength(AI_OUTPUT_LIMITS.caveats);
    expect(c.narrative.per_question[0]).toEqual({ qkey: "a", insight: "fine" });
    const ft = c.chart_spec.sections[0];
    expect(ft.kind === "free_text" && ft.themes.length).toBe(AI_OUTPUT_LIMITS.themesPerQuestion);
  });
});

describe("scrubText", () => {
  it("redacts emails, phones, links and names", () => {
    expect(scrubText("Ring Jo Bloggs on +61 400 123 456 or jo@x.com, see www.x.com/cv", { names: ["Jo", "Bloggs"] })).toBe(
      "Ring Jo [name] on [phone] or [email], see [link]"
    );
    expect(scrubText("x".repeat(400), { maxLength: 50 })).toHaveLength(50);
  });
});

describe("DetectedQuestion shape", () => {
  it("is what the routes persist", () => {
    const q: DetectedQuestion = {
      qkey: "a",
      label: "A",
      qtype: "single_choice",
      source_columns: ["A"],
      other_column: null,
      options: [],
      sort: 0,
      include_in_report: true,
    };
    expect(q.qkey).toBe("a");
  });
});
