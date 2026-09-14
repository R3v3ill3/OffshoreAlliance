import { describe, expect, it } from "vitest";
import {
  AiOutputError,
  AiRefusalError,
  buildGeneratePayload,
  buildReviewPayload,
  generateReport,
  reviewImport,
  type AiClient,
} from "../ai";
import type { ExtractionBrief, GenerateOutput, ReviewOutput } from "../schemas";
import { buildFixtureContext } from "./test-context";

const ctx = buildFixtureContext();
const qkey = (label: string) => ctx.questions.find((q) => q.label === label)!.qkey;

/** Identity values from the fixture that must never reach a prompt. */
const IDENTITY_VALUES = [
  "alex.tester@example.com",
  "ALEX.TESTER@example.com",
  "bea@example.org",
  "dana@example.net",
  "0400 000 001",
  "0400000001",
  "+64 21 000 0002",
  "Tester",
  "Sample",
  "Nobody",
  "Kiwi",
  "e:alex",
  "respondent_key",
  "Mobile Number",
  '"Email"',
];

function fakeClient<T>(parsed: T | null, extra: Partial<{ stop_reason: string }> = {}) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      parse: async (params: unknown) => {
        calls.push(params);
        return {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-test-1",
          stop_reason: extra.stop_reason ?? "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 123, output_tokens: 45 },
          content: [],
          parsed_output: parsed,
        };
      },
    },
  } as unknown as AiClient;
  return { client, calls };
}

const review: ReviewOutput = {
  summary: "An interest register for ROV roles.",
  schema_suggestions: [],
  data_quality_notes: ["Three duplicate submissions were collapsed."],
  clarifying_questions: [
    { id: "audience", question: "Who is this for?", kind: "single", options: ["Organisers", "Members"] },
  ],
};

describe("reviewImport (step 1)", () => {
  it("builds a payload with question facts, coverage and scrubbed samples only", () => {
    const payload = buildReviewPayload(ctx);
    expect(payload.coverage).toEqual({
      an_reported_total: 10,
      csv_submissions: 12,
      csv_respondents: 9,
      duplicate_submissions: 3,
    });
    expect(payload.data_quality.hidden_identity_columns).toBeGreaterThanOrEqual(4);
    expect(payload.data_quality.unparsed_timestamps).toBe(0);
    const avail = payload.questions.find((q) => q.qkey === qkey("Availability"))!;
    expect(avail.detected_type).toBe("single_choice");
    expect(avail.options!.map((o) => o.label)).toContain("Definite — available and ready");
    // Identity questions are not listed at all; meta without options is not listed.
    expect(payload.questions.some((q) => q.qkey === qkey("Email"))).toBe(false);
    expect(payload.questions.some((q) => q.qkey === qkey("Address"))).toBe(false);
    // Country is a breakdown-capable meta column and is listed with counts.
    expect(payload.questions.find((q) => q.qkey === qkey("Country"))?.options?.length).toBeGreaterThan(0);
    expect(payload.sample_rows.length).toBeLessThanOrEqual(15);
    expect(payload.sample_rows.length).toBe(ctx.rows.length);
  });

  it("never sends identity values, emails, phones or respondent keys", async () => {
    const { client, calls } = fakeClient(review);
    const result = await reviewImport(ctx, { model: "claude-test-1", client });
    expect(calls).toHaveLength(1);
    const serialised = JSON.stringify(calls[0]);
    for (const v of IDENTITY_VALUES) expect(serialised, v).not.toContain(v);
    expect(serialised).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    // Bea's note carried a phone + email → redacted markers instead.
    expect(serialised).toContain("[phone]");
    expect(serialised).toContain("[email]");
    // Dana's URL is scrubbed too.
    expect(serialised).not.toContain("example.com/cv");
    expect(result.output).toEqual(review);
    expect(result.model).toBe("claude-test-1");
    expect(result.usage).toEqual({ input_tokens: 123, output_tokens: 45 });
  });

  it("uses structured output with the review schema and no temperature/prefill", async () => {
    const { client, calls } = fakeClient(review);
    await reviewImport(ctx, { model: "claude-test-1", client });
    const params = calls[0] as Record<string, unknown>;
    expect(params.model).toBe("claude-test-1");
    expect(params.max_tokens).toBe(8000);
    expect(params.temperature).toBeUndefined();
    const format = (params.output_config as { format: { type: string; schema: unknown } }).format;
    expect(format.type).toBe("json_schema");
    expect(JSON.stringify(format.schema)).toContain("clarifying_questions");
    const messages = params.messages as { role: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  it("surfaces refusals and empty output as typed errors", async () => {
    const refused = fakeClient(null, { stop_reason: "refusal" });
    await expect(reviewImport(ctx, { model: "m", client: refused.client })).rejects.toBeInstanceOf(AiRefusalError);
    const empty = fakeClient(null);
    await expect(reviewImport(ctx, { model: "m", client: empty.client })).rejects.toBeInstanceOf(AiOutputError);
  });
});

const brief: ExtractionBrief = {
  answers: [{ id: "audience", question: "Who is this for?", answer: "Organisers" }],
  focus_qkeys: [],
  audience: "organisers",
  tone: null,
  free_text_theming: true,
  notes: null,
};

describe("generateReport (step 3)", () => {
  it("builds a payload with aggregates, candidate cross-tabs and scrubbed free text", () => {
    const payload = buildGeneratePayload(ctx, brief);
    expect(payload.headline.respondents).toBe(9);
    const avail = payload.questions.find((q) => q.qkey === qkey("Availability")) as { options: { count: number }[] };
    expect(avail.options.reduce((s, o) => s + o.count, 0)).toBe(8); // Eli left it blank
    expect(payload.candidate_crosstabs.length).toBeGreaterThan(0);
    expect(payload.crosstab_note).toMatch(/All \d+ pairs/);
    const notes = payload.free_text.find((f) => f.qkey === qkey("notes"))!;
    expect(notes.total_answered).toBe(notes.shown);
    expect(notes.truncated).toBe(false);
    expect(notes.responses.every((r) => typeof r.row_id === "number")).toBe(true);
  });

  it("omits free text when the brief turns theming off", () => {
    const payload = buildGeneratePayload(ctx, { ...brief, free_text_theming: false });
    expect(payload.free_text).toEqual([]);
  });

  it("never sends identity values and sanitises the output against the schema", async () => {
    const output: GenerateOutput = {
      narrative: {
        headline: "Most are ready now.",
        summary: "A clear majority are available.",
        per_question: [
          { qkey: qkey("Availability"), insight: "Definite dominates." },
          { qkey: "bogus", insight: "Should be dropped." },
        ],
        crosstab_insights: [],
        free_text_summaries: [{ qkey: qkey("notes"), summary: "Follow-ups." }],
        caveats: [],
      },
      chart_spec: {
        sections: [
          { kind: "question", qkey: qkey("Availability"), chart: "hbar", emphasis: "lead" },
          { kind: "question", qkey: "bogus", chart: "bar", emphasis: "normal" },
          { kind: "question", qkey: qkey("Email"), chart: "bar", emphasis: "normal" },
          { kind: "free_text", qkey: qkey("notes"), themes: [{ label: "Follow-up", row_ids: [2, 2, 4] }] },
        ],
      },
    };
    const { client, calls } = fakeClient(output);
    const result = await generateReport(ctx, { brief, model: "claude-test-1", client });

    const serialised = JSON.stringify(calls[0]);
    for (const v of IDENTITY_VALUES) expect(serialised, v).not.toContain(v);
    expect(serialised).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(serialised).toContain("[phone]");
    expect(serialised).toContain("free_text_theming");

    expect(result.output).toEqual(output);
    expect(result.sanitised.chart_spec.sections.map((s) => (s.kind === "crosstab" ? "x" : s.qkey))).toEqual([
      qkey("Availability"),
      qkey("notes"),
    ]);
    const ft = result.sanitised.chart_spec.sections.find((s) => s.kind === "free_text");
    expect(ft && ft.kind === "free_text" ? ft.themes[0].row_ids : null).toEqual([2, 4]);
    expect(result.sanitised.narrative.per_question.map((p) => p.qkey)).toEqual([qkey("Availability")]);
    expect(result.sanitised.dropped).toContain("question section bogus");
    expect(result.sanitised.dropped).toContain(`question section ${qkey("Email")}`);
    expect(result.model).toBe("claude-test-1");
    expect(result.usage.input_tokens).toBe(123);
  });
});
