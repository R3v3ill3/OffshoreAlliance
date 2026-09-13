/**
 * Zod contracts for the AI steps of the survey report.
 *
 * The AI output schemas (`reviewOutputSchema`, `generateOutputSchema`) are
 * handed to the Anthropic SDK's `zodOutputFormat()` for structured output,
 * so they use only required fields, nullable scalars and enums — no
 * optional keys, unions of objects are discriminated by `kind`.
 *
 * Claude never emits numbers we keep: chart_spec says *which* questions and
 * cross-tabs to show and how; narrative is prose. Everything numeric is
 * recomputed by aggregate.ts.
 */

import { z } from "zod";

// ─── Step 1: review ──────────────────────────────────────────────────────────

export const clarifyingQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  question: z.string().min(1).max(400),
  kind: z.enum(["single", "multi", "text"]),
  /** Empty for kind = text. */
  options: z.array(z.string().max(120)).max(8),
});

export const schemaSuggestionSchema = z.object({
  qkey: z.string().min(1),
  suggested_type: z
    .enum(["single_choice", "multi_select", "scale", "free_text", "meta", "identity"])
    .nullable(),
  suggested_label: z.string().max(200).nullable(),
  reason: z.string().max(400),
});

export const reviewOutputSchema = z.object({
  summary: z.string().max(2000),
  schema_suggestions: z.array(schemaSuggestionSchema).max(30),
  data_quality_notes: z.array(z.string().max(400)).max(12),
  clarifying_questions: z.array(clarifyingQuestionSchema).max(6),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

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
  qkey: z.string().min(1),
  chart: chartKindSchema,
  emphasis: z.enum(["lead", "normal"]),
});

export const crosstabSectionSchema = z.object({
  kind: z.literal("crosstab"),
  row_qkey: z.string().min(1),
  col_qkey: z.string().min(1),
  chart: crosstabChartKindSchema,
});

export const freeTextThemeSchema = z.object({
  label: z.string().min(1).max(120),
  row_ids: z.array(z.number().int().nonnegative()).max(20000),
});

export const freeTextSectionSchema = z.object({
  kind: z.literal("free_text"),
  qkey: z.string().min(1),
  themes: z.array(freeTextThemeSchema).max(12),
});

export const chartSectionSchema = z.discriminatedUnion("kind", [
  questionSectionSchema,
  crosstabSectionSchema,
  freeTextSectionSchema,
]);

export const chartSpecSchema = z.object({
  sections: z.array(chartSectionSchema).max(60),
});

export const narrativeSchema = z.object({
  headline: z.string().max(300),
  summary: z.string().max(4000),
  per_question: z
    .array(z.object({ qkey: z.string().min(1), insight: z.string().max(1200) }))
    .max(60),
  crosstab_insights: z
    .array(
      z.object({
        row_qkey: z.string().min(1),
        col_qkey: z.string().min(1),
        insight: z.string().max(1200),
      })
    )
    .max(20),
  free_text_summaries: z
    .array(z.object({ qkey: z.string().min(1), summary: z.string().max(2000) }))
    .max(20),
  caveats: z.array(z.string().max(400)).max(10),
});

export const generateOutputSchema = z.object({
  narrative: narrativeSchema,
  chart_spec: chartSpecSchema,
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartSection = z.infer<typeof chartSectionSchema>;
export type ReportNarrative = z.infer<typeof narrativeSchema>;
export type GenerateOutput = z.infer<typeof generateOutputSchema>;

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
          .filter((t) => t.row_ids.length > 0),
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
