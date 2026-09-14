/**
 * The two Claude calls of the survey report (step 1 review, step 3
 * generate). Both use structured output (`messages.parse` +
 * `zodOutputFormat`) so the app never JSON.parses prose.
 *
 * PII minimisation is a hard rule here: identity-type questions,
 * respondent keys and raw identity values never leave the app. Free text
 * is scrubbed (email / phone / URL / the respondent's own name tokens) and
 * truncated before it is placed in a prompt.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  aggregateQuestion,
  candidateCrossTabPairs,
  crossTab,
  crossTabContrast,
  isChoiceLike,
  type QuestionLike,
} from "./aggregate";
import { detectIdentityColumns } from "./dedupe";
import { cleanCell } from "./normalise";
import { scrubText } from "./pii";
import {
  clampGenerateOutput,
  clampReviewOutput,
  generateOutputSchema,
  reviewOutputSchema,
  sanitiseGenerateOutput,
  type ExtractionBrief,
  type GenerateOutput,
  type ReviewOutput,
  type SanitiseResult,
} from "./schemas";
import { buildAggregates, type ImportContext, type LoadedRow } from "./server";
import type { AnSurveyQuestion, CrossTab } from "./types";

/** The slice of the Anthropic client we call — lets tests inject a stub. */
export type AiClient = { messages: Pick<Anthropic["messages"], "parse"> };

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
}

/** Claude declined to answer (stop_reason = refusal). Routes map this to 502. */
export class AiRefusalError extends Error {
  constructor(message = "The AI declined to analyse this data. Check the responses for content that may have triggered a refusal.") {
    super(message);
    this.name = "AiRefusalError";
  }
}

/** The response carried no parseable structured output. Routes map this to 502. */
export class AiOutputError extends Error {
  constructor(message = "The AI returned an unreadable response. Please try again.") {
    super(message);
    this.name = "AiOutputError";
  }
}

export const MAX_TOKENS = 8000;
export const REVIEW_SAMPLE_ROWS = 15;
export const REVIEW_SAMPLE_TEXT_MAX = 300;
export const GENERATE_FREE_TEXT_MAX = 200;
export const CROSSTAB_ALL_PAIRS_LIMIT = 8;
export const CROSSTAB_TOP_N = 20;

const SYSTEM_PREAMBLE = `You are an analyst inside a union organising database used by organisers of the Offshore Alliance (an AWU/MUA initiative in Australia's offshore oil and gas sector).
The data you are shown is an export of responses to one Action Network form or survey, already aggregated by the application.
You interpret only: you never see who responded, and you must not try to identify anyone. Any names, emails or phone numbers that slipped into free text have been redacted as [name], [email], [phone].
Write in plain Australian English for a union audience.`;

// ─── Shared helpers ─────────────────────────────────────────────────────────

function isReviewable(q: AnSurveyQuestion): boolean {
  if (q.qtype === "identity") return false;
  if (q.qtype === "meta") return q.options.length > 0;
  return true;
}

function questionLabelMap(questions: QuestionLike[]): Map<string, string> {
  return new Map(questions.map((q) => [q.qkey, q.label]));
}

function assertNotRefused(response: { stop_reason: string | null }): void {
  if (response.stop_reason === "refusal") throw new AiRefusalError();
}

// ─── Step 1: review ─────────────────────────────────────────────────────────

export interface ReviewPayload {
  title: string;
  source_kind: string;
  coverage: {
    an_reported_total: number | null;
    csv_submissions: number;
    csv_respondents: number;
    duplicate_submissions: number;
  };
  data_quality: {
    unparsed_timestamps: number;
    questions_with_no_answers: string[];
    hidden_identity_columns: number;
  };
  questions: {
    qkey: string;
    label: string;
    detected_type: string;
    include_in_report: boolean;
    source_column_count: number;
    blank: number;
    answered: number;
    options: { label: string; count: number }[] | null;
  }[];
  sample_rows: Record<string, string>[];
  sample_note: string;
}

function blankCount(q: AnSurveyQuestion, rows: LoadedRow[]): number {
  const cols = [...q.source_columns, ...(q.other_column ? [q.other_column] : [])];
  let blank = 0;
  for (const r of rows) {
    if (cols.every((c) => !cleanCell(r.data[c]))) blank++;
  }
  return blank;
}

/** Value of a row for one question, formatted for a prompt (free text scrubbed). */
function sampleValue(q: AnSurveyQuestion, row: LoadedRow): string {
  const scrub = (t: string) => scrubText(t, { names: row.name_tokens, maxLength: REVIEW_SAMPLE_TEXT_MAX });
  if (q.qtype === "multi_select") {
    const picked = q.source_columns
      .filter((c) => cleanCell(row.data[c]) && /^(1|true|yes|y|x|✓)$/i.test(cleanCell(row.data[c])))
      .map((c) => cleanCell(c.slice(c.indexOf("_") + 1)));
    const other = q.other_column ? cleanCell(row.data[q.other_column]) : "";
    if (other) picked.push(`Other: ${scrub(other)}`);
    return picked.join("; ");
  }
  const v = cleanCell(row.data[q.source_columns[0] ?? ""]);
  if (!v) return "";
  return q.qtype === "free_text" ? scrub(v) : v.length > REVIEW_SAMPLE_TEXT_MAX ? scrub(v) : v;
}

/** Evenly spread sample of ≤ n rows. */
function spreadSample<T>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(rows[Math.floor((i * rows.length) / n)]);
  return out;
}

/** Build the step-1 prompt payload. Exported for tests (PII assertions). */
export function buildReviewPayload(ctx: ImportContext): ReviewPayload {
  const batch = ctx.current_batch;
  const rows = ctx.rows;
  const identity = detectIdentityColumns(batch?.headers ?? []);
  const reviewable = ctx.questions.filter(isReviewable);

  let unparsed = 0;
  if (identity.timestamp) {
    for (const r of rows) if (cleanCell(r.data[identity.timestamp]) && !r.submitted_at) unparsed++;
  }

  const questions = reviewable.map((q) => {
    const forced: QuestionLike = { ...q, include_in_report: true };
    const agg = aggregateQuestion(forced, rows);
    const blank = blankCount(q, rows);
    let options: { label: string; count: number }[] | null = null;
    if (agg && agg.qtype !== "free_text") {
      options = agg.options.map((o) => ({ label: o.label, count: o.count }));
    }
    return {
      qkey: q.qkey,
      label: q.label,
      detected_type: q.qtype,
      include_in_report: q.include_in_report,
      source_column_count: q.source_columns.length,
      blank,
      answered: rows.length - blank,
      options,
    };
  });

  const sampleQuestions = reviewable.filter((q) => q.qtype !== "meta");
  const sample_rows = spreadSample(rows, REVIEW_SAMPLE_ROWS).map((r) => {
    const out: Record<string, string> = {};
    for (const q of sampleQuestions) {
      const v = sampleValue(q, r);
      if (v) out[q.qkey] = v;
    }
    return out;
  });

  return {
    title: ctx.import.title,
    source_kind: ctx.import.source_kind,
    coverage: {
      an_reported_total: ctx.import.an_total_records,
      csv_submissions: batch?.row_count ?? rows.length,
      csv_respondents: batch?.response_count ?? rows.length,
      duplicate_submissions: batch?.duplicate_count ?? 0,
    },
    data_quality: {
      unparsed_timestamps: unparsed,
      questions_with_no_answers: questions.filter((q) => q.answered === 0).map((q) => q.qkey),
      hidden_identity_columns: ctx.questions.filter((q) => q.qtype === "identity").length,
    },
    questions,
    sample_rows,
    sample_note:
      rows.length > REVIEW_SAMPLE_ROWS
        ? `${REVIEW_SAMPLE_ROWS} of ${rows.length} respondents shown, spread evenly through the file.`
        : `All ${rows.length} respondents shown.`,
  };
}

const REVIEW_SYSTEM = `${SYSTEM_PREAMBLE}

Task: review a freshly imported export before a report is written. You receive the detected question schema (with option counts), data-quality facts and a small sample of responses (identity columns removed).
Return:
- summary: 2–4 sentences on what this form/survey appears to be about and what the data can support.
- schema_suggestions: ONLY where a detected type or label looks wrong (e.g. a free_text column that is really a small set of choices, a scale that is a category code, a meta column worth including as a breakdown). Leave the array empty when the detection looks right. suggested_type / suggested_label may be null when only one of them changes.
- data_quality_notes: short, concrete observations an organiser should know before trusting the numbers (coverage gap versus Action Network's count, duplicates, empty questions, unparsed timestamps, tiny sample sizes).
- clarifying_questions: at most 6 questions that would change how the report is written — what the organiser wants to extract, who it is for, which comparisons matter. Give each a short slug id (e.g. "audience", "focus"). Use kind "single" or "multi" with options where a short list of choices is natural, "text" otherwise.
Do not attempt to identify respondents. Do not quote free text verbatim.`;

export async function reviewImport(
  ctx: ImportContext,
  opts: { model: string; client: AiClient }
): Promise<{ output: ReviewOutput; model: string; usage: AiUsage }> {
  const payload = buildReviewPayload(ctx);
  const response = await opts.client.messages.parse({
    model: opts.model,
    max_tokens: MAX_TOKENS,
    system: REVIEW_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Review this import and return the structured review.\n\n<import>\n${JSON.stringify(payload, null, 1)}\n</import>`,
      },
    ],
    output_config: { format: zodOutputFormat(reviewOutputSchema) },
  });
  assertNotRefused(response);
  if (!response.parsed_output) throw new AiOutputError();
  return {
    output: clampReviewOutput(response.parsed_output),
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

// ─── Step 3: generate ───────────────────────────────────────────────────────

export interface CompactCrossTab {
  row_qkey: string;
  col_qkey: string;
  row_labels: string[];
  col_labels: string[];
  /** cells[row][col] = respondents in both. */
  cells: number[][];
  n: number;
}

export interface GeneratePayload {
  title: string;
  brief: ExtractionBrief;
  headline: {
    submissions: number;
    respondents: number;
    duplicates: number;
    an_reported_total: number | null;
  };
  questions: Record<string, unknown>[];
  candidate_crosstabs: CompactCrossTab[];
  crosstab_note: string;
  free_text: {
    qkey: string;
    label: string;
    total_answered: number;
    shown: number;
    truncated: boolean;
    responses: { row_id: number; text: string }[];
  }[];
}

function compact(ct: CrossTab): CompactCrossTab {
  return {
    row_qkey: ct.row_qkey,
    col_qkey: ct.col_qkey,
    row_labels: ct.row_options.map((o) => o.label),
    col_labels: ct.col_options.map((o) => o.label),
    cells: ct.cells,
    n: ct.n,
  };
}

/**
 * Candidate cross-tabs for step 3: every pair when there are ≤ 8 choice-like
 * included questions, otherwise the 20 with the strongest contrast.
 */
export function candidateCrossTabs(questions: QuestionLike[], rows: LoadedRow[]): { tabs: CrossTab[]; note: string } {
  const choice = questions.filter((q) => q.include_in_report && isChoiceLike(q));
  const byKey = new Map(choice.map((q) => [q.qkey, q]));
  const pairs = candidateCrossTabPairs(questions);
  const tabs = pairs.flatMap((p) => {
    const rq = byKey.get(p.row_qkey);
    const cq = byKey.get(p.col_qkey);
    return rq && cq ? [crossTab(rq, cq, rows)] : [];
  });
  if (choice.length <= CROSSTAB_ALL_PAIRS_LIMIT) {
    return { tabs, note: `All ${tabs.length} pairs of choice questions are listed.` };
  }
  const ranked = tabs
    .map((t) => ({ t, score: crossTabContrast(t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CROSSTAB_TOP_N)
    .map((x) => x.t);
  return {
    tabs: ranked,
    note: `${choice.length} choice questions give ${tabs.length} possible pairs; the ${ranked.length} with the strongest contrast are listed.`,
  };
}

/** Build the step-3 prompt payload. Exported for tests (PII assertions). */
export function buildGeneratePayload(ctx: ImportContext, brief: ExtractionBrief): GeneratePayload {
  const aggregates = buildAggregates(ctx, { includeText: true, maxFreeTextResponses: GENERATE_FREE_TEXT_MAX });
  if (!aggregates) throw new Error("No current batch to analyse");
  const labels = questionLabelMap(ctx.questions);

  const questions = aggregates.questions.map((q): Record<string, unknown> => {
    const base = { qkey: q.qkey, label: labels.get(q.qkey) ?? q.qkey, qtype: q.qtype };
    if (q.qtype === "free_text") {
      return { ...base, n_answered: q.n_answered, no_answer: q.no_answer, top_terms: q.top_terms };
    }
    if (q.qtype === "multi_select") {
      return {
        ...base,
        n_respondents: q.n_respondents,
        none_selected: q.none_selected,
        avg_selections: q.avg_selections,
        options: q.options.map((o) => ({ label: o.label, count: o.count, pct_of_respondents: o.pct })),
        other_specified: q.other_texts.slice(0, 50),
      };
    }
    return {
      ...base,
      n_answered: q.n_answered,
      no_answer: q.no_answer,
      mean: q.mean,
      options: q.options.map((o) => ({ label: o.label, count: o.count, pct: o.pct })),
    };
  });

  const { tabs, note } = candidateCrossTabs(ctx.questions, ctx.rows);

  const free_text = brief.free_text_theming
    ? aggregates.questions.flatMap((q) =>
        q.qtype === "free_text"
          ? [
              {
                qkey: q.qkey,
                label: labels.get(q.qkey) ?? q.qkey,
                total_answered: q.n_answered,
                shown: q.responses.length,
                truncated: q.truncated,
                responses: q.responses.map((r) => ({
                  row_id: r.row_id,
                  text: scrubText(r.text, { maxLength: REVIEW_SAMPLE_TEXT_MAX }),
                })),
              },
            ]
          : []
      )
    : [];

  return {
    title: ctx.import.title,
    brief,
    headline: {
      submissions: aggregates.headline.submissions,
      respondents: aggregates.headline.respondents,
      duplicates: aggregates.headline.duplicates,
      an_reported_total: aggregates.headline.an_total_records,
    },
    questions,
    candidate_crosstabs: tabs.map(compact),
    crosstab_note: note,
    free_text,
  };
}

const GENERATE_SYSTEM = `${SYSTEM_PREAMBLE}

Task: write the narrative for a report over the aggregated responses and choose which charts to feature. The application renders every figure itself from the same aggregates you are shown, so:
- NEVER write numbers, counts or percentages in any text field. Say "a clear majority", "roughly a third", "a small minority", "almost everyone", "only a handful". The app places the exact figures beside each insight.
- narrative.headline: one sentence, the single most useful finding for the organiser's stated purpose. narrative.summary: 2–5 short paragraphs (plain text, blank line between paragraphs).
- narrative.per_question: one insight per question worth commenting on (skip questions with nothing to say). narrative.crosstab_insights: only for cross-tabs that actually show a difference worth acting on. narrative.free_text_summaries: one prose summary per free_text question that was provided (what people raised, in what spirit) — no verbatim quotes longer than a few words.
- narrative.caveats: data-quality caveats (coverage gap versus Action Network's count, duplicates, small samples, unparsed timestamps, many blanks) — keep them short and honest.
- chart_spec.sections: ordered, most important first. Use kind "question" with a chart kind ("hbar" for many or long options, "bar" for scales and short lists, "pie" only for 2–4 options, "stacked" for scales) and emphasis "lead" for at most three sections. Use kind "crosstab" (from the candidate list only) with "stacked_bar", "heatmap" or "table". Use kind "free_text" for each free-text question you were given responses for, with themes: 3–8 themes, each listing the row_ids (from the provided list only) of responses that belong to it; a response may sit in more than one theme. Do not invent row_ids.
- Only reference qkeys that appear in the input. Honour the brief: its answers, audience and tone, focus_qkeys (feature these first) and notes.
Do not attempt to identify respondents.`;

export async function generateReport(
  ctx: ImportContext,
  opts: { brief: ExtractionBrief; model: string; client: AiClient }
): Promise<{ output: GenerateOutput; sanitised: SanitiseResult; model: string; usage: AiUsage }> {
  const payload = buildGeneratePayload(ctx, opts.brief);
  const response = await opts.client.messages.parse({
    model: opts.model,
    max_tokens: MAX_TOKENS,
    system: GENERATE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Write the report narrative and chart specification for this survey.\n\n<survey>\n${JSON.stringify(payload, null, 1)}\n</survey>`,
      },
    ],
    output_config: { format: zodOutputFormat(generateOutputSchema) },
  });
  assertNotRefused(response);
  if (!response.parsed_output) throw new AiOutputError();
  const output = clampGenerateOutput(response.parsed_output);

  const included = ctx.questions.filter((q) => q.include_in_report && q.qtype !== "identity");
  const knownQkeys = new Set(included.map((q) => q.qkey));
  const freeTextQkeys = new Set(included.filter((q) => q.qtype === "free_text").map((q) => q.qkey));
  const sanitised = sanitiseGenerateOutput(output, knownQkeys, freeTextQkeys);

  return {
    output,
    sanitised,
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
