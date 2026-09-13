/**
 * Zod contracts for the AI steps of the survey report.
 *
 * The AI output schemas (`reviewOutputSchema`, `generateOutputSchema`) are
 * handed to the Anthropic SDK's `zodOutputFormat()` for structured output.
 * Anthropic's structured outputs enforce shape (types, enums, required
 * keys) but NOT length constraints (`maxItems`, `maxLength`, `minLength`),
 * so those schemas carry no length rules — a `.max()` there makes the
 * SDK's post-parse zod check reject an otherwise valid reply (seen in
 * production: seven clarifying questions against a `.max(6)`). Limits are
 * applied afterwards by `clampReviewOutput` / `clampGenerateOutput`.
 *
 * Claude never emits numbers we keep: chart_spec says *which* questions and
 * cross-tabs to show and how; narrative is prose. Everything numeric is
 * recomputed by aggregate.ts.
 */

import { z } from "zod";

// ─── Limits (applied after parsing, never inside the output schema) ────────

export const AI_OUTPUT_LIMITS = {
  clarifyingQuestions: 6,
  clarifyingOptions: 8,
  schemaSuggestions: 30,
  dataQualityNotes: 12,
  perQuestionInsights: 60,
  crosstabInsights: 20,
  freeTextSummaries: 20,
  caveats: 10,
  chartSections: 60,
  themesPerQuestion: 12,
  themeRowIds: 20000,
  shortText: 400,
  labelText: 200,
  insightText: 1200,
  summaryText: 4000,
} as const;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// ─── Step 1: review ──────────────────────────────────────────────────────────

export const clarifyingQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  kind: z.enum(["single", "multi", "text"]),
  /** Empty for kind = text. */
  options: z.array(z.string()),
});

export const schemaSuggestionSchema = z.object({
  qkey: z.string(),
  suggested_type: z
    .enum(["single_choice", "multi_select", "scale", "free_text", "meta", "identity"])
    .nullable(),
  suggested_label: z.string().nullable(),
  reason: z.string(),
});

export const reviewOutputSchema = z.object({
  summary: z.string(),
  schema_suggestions: z.array(schemaSuggestionSchema),
  data_quality_notes: z.array(z.string()),
  clarifying_questions: z.array(clarifyingQuestionSchema),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

/** Enforce the size limits the output schema deliberately omits. */
export function clampReviewOutput(r: ReviewOutput): ReviewOutput {
  const L = AI_OUTPUT_LIMITS;
  const seenIds = new Set<string>();
  const clarifying_questions: ClarifyingQuestion[] = [];
  for (const q of r.clarifying_questions) {
    if (clarifying_questions.length >= L.clarifyingQuestions) break;
    const id = q.id.trim() || `q${clarifying_questions.length + 1}`;
    const question = q.question.trim();
    if (!question || seenIds.has(id)) continue;
    seenIds.add(id);
    clarifying_questions.push({
      id: clip(id, 40),
      question: clip(question, L.shortText),
      kind: q.kind,
      options:
        q.kind === "text"
          ? []
          : q.options
              .map((o) => clip(o, 120))
              .filter(Boolean)
              .slice(0, L.clarifyingOptions),
    });
  }
  return {
    summary: clip(r.summary, 2000),
    schema_suggestions: r.schema_suggestions
      .filter((s) => s.qkey.trim())
      .slice(0, L.schemaSuggestions)
      .map((s) => ({
        qkey: s.qkey.trim(),
        suggested_type: s.suggested_type,
        suggested_label: s.suggested_label ? clip(s.suggested_label, L.labelText) : null,
        reason: clip(s.reason, L.shortText),
      })),
    data_quality_notes: r.data_quality_notes
      .map((n) => clip(n, L.shortText))
      .filter(Boolean)
      .slice(0, L.dataQualityNotes),
    clarifying_questions,
  };
}

// ─── Step 2: extraction brief (user input, validated by the route) ──────────

export const extractionBriefSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        question: z.string().max(400),
        answer: z.string().max(2000),
      })
    )
    .max(12),
  focus_qkeys: z.array(z.string()).max(40).default([]),
  audience: z.enum(["organisers", "members", "delegates", "external"]).default("organisers"),
  tone: z.string().max(200).nullable().default(null),
  free_text_theming: z.boolean().default(true),
  notes: z.string().max(2000).nullable().default(null),
});

export type ExtractionBrief = z.infer<typeof extractionBriefSchema>;

// ─── Step 3: generate ───────────────────────────────────────────────────────

export const chartKindSchema = z.enum(["bar", "hbar", "pie", "stacked"]);
export const crosstabChartKindSchema = z.enum(["stacked_bar", "heatmap", "table"]);

export const questionSectionSchema = z.object({
  kind: z.literal("question"),
  qkey: z.string(),
  chart: chartKindSchema,
  emphasis: z.enum(["lead", "normal"]),
});

export const crosstabSectionSchema = z.object({
  kind: z.literal("crosstab"),
  row_qkey: z.string(),
  col_qkey: z.string(),
  chart: crosstabChartKindSchema,
});

export const freeTextThemeSchema = z.object({
  label: z.string(),
  row_ids: z.array(z.number().int().nonnegative()),
});

export const freeTextSectionSchema = z.object({
  kind: z.literal("free_text"),
  qkey: z.string(),
  themes: z.array(freeTextThemeSchema),
});

export const chartSectionSchema = z.discriminatedUnion("kind", [
  questionSectionSchema,
  crosstabSectionSchema,
  freeTextSectionSchema,
]);

export const chartSpecSchema = z.object({
  sections: z.array(chartSectionSchema),
});

export const narrativeSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  per_question: z.array(z.object({ qkey: z.string(), insight: z.string() })),
  crosstab_insights: z.array(
    z.object({
      row_qkey: z.string(),
      col_qkey: z.string(),
      insight: z.string(),
    })
  ),
  free_text_summaries: z.array(z.object({ qkey: z.string(), summary: z.string() })),
  caveats: z.array(z.string()),
});

export const generateOutputSchema = z.object({
  narrative: narrativeSchema,
  chart_spec: chartSpecSchema,
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartSection = z.infer<typeof chartSectionSchema>;
export type ReportNarrative = z.infer<typeof narrativeSchema>;
export type GenerateOutput = z.infer<typeof generateOutputSchema>;

/** Enforce the size limits the output schema deliberately omits. */
export function clampGenerateOutput(g: GenerateOutput): GenerateOutput {
  const L = AI_OUTPUT_LIMITS;
  const n = g.narrative;
  return {
    narrative: {
      headline: clip(n.headline, 300),
      summary: clip(n.summary, L.summaryText),
      per_question: n.per_question
        .filter((p) => p.qkey.trim())
        .slice(0, L.perQuestionInsights)
        .map((p) => ({ qkey: p.qkey.trim(), insight: clip(p.insight, L.insightText) })),
      crosstab_insights: n.crosstab_insights
        .filter((c) => c.row_qkey.trim() && c.col_qkey.trim())
        .slice(0, L.crosstabInsights)
        .map((c) => ({
          row_qkey: c.row_qkey.trim(),
          col_qkey: c.col_qkey.trim(),
          insight: clip(c.insight, L.insightText),
        })),
      free_text_summaries: n.free_text_summaries
        .filter((f) => f.qkey.trim())
        .slice(0, L.freeTextSummaries)
        .map((f) => ({ qkey: f.qkey.trim(), summary: clip(f.summary, 2000) })),
      caveats: n.caveats
        .map((c) => clip(c, L.shortText))
        .filter(Boolean)
        .slice(0, L.caveats),
    },
    chart_spec: {
      sections: g.chart_spec.sections.slice(0, L.chartSections).map((s) =>
        s.kind === "free_text"
          ? {
              ...s,
              themes: s.themes.slice(0, L.themesPerQuestion).map((t) => ({
                label: clip(t.label, 120),
                row_ids: t.row_ids.slice(0, L.themeRowIds),
              })),
            }
          : s
      ),
    },
  };
}

// ─── Sanitising AI output against the real schema ───────────────────────────

export interface SanitiseResult {
  narrative: ReportNarrative;
  chart_spec: ChartSpec;
  dropped: string[];
}

/**
 * Drop chart sections / insights that reference unknown or excluded
 * questions instead of failing the whole report. `knownQkeys` are the
 * report-included questions; `freeTextQkeys` those whose type is free_text.
 */
export function sanitiseGenerateOutput(
  output: GenerateOutput,
  knownQkeys: Set<string>,
  freeTextQkeys: Set<string>
): SanitiseResult {
  const dropped: string[] = [];
  const seen = new Set<string>();
  const sections: ChartSection[] = [];

  for (const s of output.chart_spec.sections) {
    if (s.kind === "question") {
      if (!knownQkeys.has(s.qkey) || freeTextQkeys.has(s.qkey)) {
        dropped.push(`question section ${s.qkey}`);
        continue;
      }
      const key = `q:${s.qkey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sections.push(s);
    } else if (s.kind === "crosstab") {
      if (
        !knownQkeys.has(s.row_qkey) ||
        !knownQkeys.has(s.col_qkey) ||
        freeTextQkeys.has(s.row_qkey) ||
        freeTextQkeys.has(s.col_qkey) ||
        s.row_qkey === s.col_qkey
      ) {
        dropped.push(`crosstab ${s.row_qkey}×${s.col_qkey}`);
        continue;
      }
      const key = `x:${s.row_qkey}|${s.col_qkey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sections.push(s);
    } else {
      if (!freeTextQkeys.has(s.qkey)) {
        dropped.push(`free_text section ${s.qkey}`);
        continue;
      }
      const key = `t:${s.qkey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sections.push({
        ...s,
        themes: s.themes
          .map((t) => ({ ...t, row_ids: Array.from(new Set(t.row_ids)) }))
          .filter((t) => t.row_ids.length > 0 && t.label.trim()),
      });
    }
  }

  const narrative: ReportNarrative = {
    ...output.narrative,
    per_question: output.narrative.per_question.filter((p) => {
      const ok = knownQkeys.has(p.qkey);
      if (!ok) dropped.push(`insight for ${p.qkey}`);
      return ok;
    }),
    crosstab_insights: output.narrative.crosstab_insights.filter((c) => {
      const ok = knownQkeys.has(c.row_qkey) && knownQkeys.has(c.col_qkey);
      if (!ok) dropped.push(`crosstab insight ${c.row_qkey}×${c.col_qkey}`);
      return ok;
    }),
    free_text_summaries: output.narrative.free_text_summaries.filter((f) =>
      freeTextQkeys.has(f.qkey)
    ),
  };

  return { narrative, chart_spec: { sections }, dropped };
}

/** Parse persisted jsonb defensively — an old/invalid row must not 500 the page. */
export function parseStoredNarrative(value: unknown): ReportNarrative | null {
  const r = narrativeSchema.safeParse(value);
  return r.success ? r.data : null;
}

export function parseStoredChartSpec(value: unknown): ChartSpec | null {
  const r = chartSpecSchema.safeParse(value);
  return r.success ? r.data : null;
}

export function parseStoredBrief(value: unknown): ExtractionBrief | null {
  const r = extractionBriefSchema.safeParse(value);
  return r.success ? r.data : null;
}

export function parseStoredReview(value: unknown): ReviewOutput | null {
  const r = reviewOutputSchema.safeParse(value);
  return r.success ? r.data : null;
}
