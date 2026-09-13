/**
 * Pure shaping for the Surveys & Forms report dashboard.
 *
 * Every number the dashboard draws comes from the aggregates the report
 * route computed; this file only re-bases percentages when the "Include no
 * answer" toggle is on, and turns a report's chart_spec (or, with no report,
 * the question list) into an ordered list of sections. No React, no I/O —
 * unit tested in __tests__/helpers.test.ts.
 */

import type { ChartSection, ChartSpec, ReportNarrative } from "@/lib/an-surveys/schemas";
import type {
  AnSurveyQuestion,
  AnSurveyReportResponse,
  ChoiceAggregate,
  CrossTab,
  FreeTextAggregate,
  MultiSelectAggregate,
  QuestionAggregate,
  SurveyAggregates,
} from "@/lib/an-surveys/types";

/** localStorage key for the count/% toggle (mirrors the SMS report's). */
export const AN_SURVEY_LABEL_MODE_STORAGE_KEY = "an-survey-report-label-mode";

export const NO_ANSWER_KEY = "__no_answer__";
export const NO_ANSWER_LABEL = "No answer";
export const NONE_SELECTED_LABEL = "None selected";

/** One drawable row: a count and the denominator its share is taken over. */
export interface DisplayRow {
  key: string;
  label: string;
  count: number;
  /** Denominator for `pct`. */
  base: number;
  /** 0–100, one decimal. */
  pct: number;
  /** True for the synthetic "No answer" / "None selected" row. */
  synthetic: boolean;
}

/** Share of `total`, one decimal, 0 when the base is empty. */
export function pctOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/**
 * Rows for a single_choice / scale question. By default shares are of the
 * respondents who answered; with `includeNoAnswer` the base widens to every
 * respondent and a "No answer" row is appended.
 */
export function choiceRows(agg: ChoiceAggregate, includeNoAnswer: boolean): DisplayRow[] {
  const base = includeNoAnswer ? agg.n_answered + agg.no_answer : agg.n_answered;
  const rows: DisplayRow[] = agg.options.map((o) => ({
    key: o.key,
    label: o.label,
    count: o.count,
    base,
    pct: pctOf(o.count, base),
    synthetic: false,
  }));
  if (includeNoAnswer && agg.no_answer > 0) {
    rows.push({
      key: NO_ANSWER_KEY,
      label: NO_ANSWER_LABEL,
      count: agg.no_answer,
      base,
      pct: pctOf(agg.no_answer, base),
      synthetic: true,
    });
  }
  return rows;
}

/**
 * Rows for a multi_select question. Shares are per respondent (one person
 * can tick several boxes, so they do not sum to 100). `n_respondents` is the
 * people who ticked at least one option; with `includeNoAnswer` the base
 * widens by `none_selected` and a "None selected" row is appended.
 */
export function multiSelectRows(agg: MultiSelectAggregate, includeNoAnswer: boolean): DisplayRow[] {
  const base = includeNoAnswer ? agg.n_respondents + agg.none_selected : agg.n_respondents;
  const rows: DisplayRow[] = agg.options.map((o) => ({
    key: o.key,
    label: o.label,
    count: o.count,
    base,
    pct: pctOf(o.count, base),
    synthetic: false,
  }));
  if (includeNoAnswer && agg.none_selected > 0) {
    rows.push({
      key: NO_ANSWER_KEY,
      label: NONE_SELECTED_LABEL,
      count: agg.none_selected,
      base,
      pct: pctOf(agg.none_selected, base),
      synthetic: true,
    });
  }
  return rows;
}

/** Cross-tab pair as the report route's `crosstabs=` token. */
export function crosstabToken(rowQkey: string, colQkey: string): string {
  return `${rowQkey}:${colQkey}`;
}

/** Every cross-tab a chart_spec asks for, as `crosstabs=` tokens (deduplicated). */
export function crosstabTokensFor(spec: ChartSpec | null | undefined): string[] {
  if (!spec) return [];
  const out = new Set<string>();
  for (const s of spec.sections) {
    if (s.kind === "crosstab") out.add(crosstabToken(s.row_qkey, s.col_qkey));
  }
  return [...out];
}

// ─── Sections ───────────────────────────────────────────────────────────────

export type QuestionChartKind = "bar" | "hbar" | "pie" | "stacked";
export type CrosstabChartKind = "stacked_bar" | "heatmap" | "table";

export type DashboardSection =
  | {
      kind: "question";
      qkey: string;
      question: AnSurveyQuestion;
      agg: ChoiceAggregate | MultiSelectAggregate;
      chart: QuestionChartKind;
      emphasis: "lead" | "normal";
      insight: string | null;
    }
  | {
      kind: "crosstab";
      row_qkey: string;
      col_qkey: string;
      rowQuestion: AnSurveyQuestion;
      colQuestion: AnSurveyQuestion;
      /** Null until the route has been asked for this pair. */
      crosstab: CrossTab | null;
      chart: CrosstabChartKind;
      insight: string | null;
    }
  | {
      kind: "free_text";
      qkey: string;
      question: AnSurveyQuestion;
      agg: FreeTextAggregate;
      summary: string | null;
      insight: string | null;
    };

function defaultChartFor(agg: QuestionAggregate): QuestionChartKind {
  return agg.qtype === "multi_select" ? "hbar" : "bar";
}

function insightFor(narrative: ReportNarrative | null, qkey: string): string | null {
  return narrative?.per_question.find((p) => p.qkey === qkey)?.insight ?? null;
}

function crosstabInsightFor(
  narrative: ReportNarrative | null,
  rowQkey: string,
  colQkey: string
): string | null {
  return (
    narrative?.crosstab_insights.find((c) => c.row_qkey === rowQkey && c.col_qkey === colQkey)
      ?.insight ?? null
  );
}

function summaryFor(narrative: ReportNarrative | null, qkey: string): string | null {
  return narrative?.free_text_summaries.find((f) => f.qkey === qkey)?.summary ?? null;
}

function sectionFromSpec(
  s: ChartSection,
  questionsByKey: ReadonlyMap<string, AnSurveyQuestion>,
  aggByKey: ReadonlyMap<string, QuestionAggregate>,
  crosstabs: readonly CrossTab[],
  narrative: ReportNarrative | null
): DashboardSection | null {
  if (s.kind === "question") {
    const question = questionsByKey.get(s.qkey);
    const agg = aggByKey.get(s.qkey);
    if (!question || !agg || agg.qtype === "free_text") return null;
    return {
      kind: "question",
      qkey: s.qkey,
      question,
      agg,
      chart: s.chart,
      emphasis: s.emphasis,
      insight: insightFor(narrative, s.qkey),
    };
  }
  if (s.kind === "crosstab") {
    const rowQuestion = questionsByKey.get(s.row_qkey);
    const colQuestion = questionsByKey.get(s.col_qkey);
    if (!rowQuestion || !colQuestion) return null;
    const crosstab =
      crosstabs.find((c) => c.row_qkey === s.row_qkey && c.col_qkey === s.col_qkey) ?? null;
    return {
      kind: "crosstab",
      row_qkey: s.row_qkey,
      col_qkey: s.col_qkey,
      rowQuestion,
      colQuestion,
      crosstab,
      chart: s.chart,
      insight: crosstabInsightFor(narrative, s.row_qkey, s.col_qkey),
    };
  }
  const question = questionsByKey.get(s.qkey);
  const agg = aggByKey.get(s.qkey);
  if (!question || !agg || agg.qtype !== "free_text") return null;
  return {
    kind: "free_text",
    qkey: s.qkey,
    question,
    agg,
    summary: summaryFor(narrative, s.qkey),
    insight: insightFor(narrative, s.qkey),
  };
}

/**
 * The sections to draw, in order.
 *
 *  * With a report: `chart_spec.sections` order, each resolved against the
 *    real questions and aggregates; a section naming an unknown or excluded
 *    question is dropped, not fatal. Any included aggregate the spec forgot
 *    is appended in question order so nothing the data has goes unshown.
 *  * Without a report: every included, non-identity aggregate in question
 *    sort order, with a default chart per type.
 */
export function buildSections(
  questions: readonly AnSurveyQuestion[],
  aggregates: SurveyAggregates | null,
  report: Pick<NonNullable<AnSurveyReportResponse["report"]>, "chart_spec" | "narrative"> | null
): DashboardSection[] {
  if (!aggregates) return [];

  const questionsByKey = new Map(questions.map((q) => [q.qkey, q]));
  const aggByKey = new Map(aggregates.questions.map((a) => [a.qkey, a]));
  const narrative = report?.narrative ?? null;

  const ordered = [...questions].sort((a, b) => a.sort - b.sort);
  const fallback = (): DashboardSection[] => {
    const out: DashboardSection[] = [];
    for (const q of ordered) {
      if (!q.include_in_report || q.qtype === "identity") continue;
      const agg = aggByKey.get(q.qkey);
      if (!agg) continue;
      if (agg.qtype === "free_text") {
        out.push({
          kind: "free_text",
          qkey: q.qkey,
          question: q,
          agg,
          summary: summaryFor(narrative, q.qkey),
          insight: insightFor(narrative, q.qkey),
        });
      } else {
        out.push({
          kind: "question",
          qkey: q.qkey,
          question: q,
          agg,
          chart: defaultChartFor(agg),
          emphasis: "normal",
          insight: insightFor(narrative, q.qkey),
        });
      }
    }
    return out;
  };

  if (!report) return fallback();

  const sections: DashboardSection[] = [];
  const shown = new Set<string>();
  for (const s of report.chart_spec.sections) {
    const built = sectionFromSpec(s, questionsByKey, aggByKey, aggregates.crosstabs, narrative);
    if (!built) continue;
    if (built.kind !== "crosstab") {
      if (shown.has(built.qkey)) continue;
      shown.add(built.qkey);
    }
    sections.push(built);
  }
  for (const extra of fallback()) {
    if (extra.kind === "crosstab" || shown.has(extra.qkey)) continue;
    shown.add(extra.qkey);
    sections.push(extra);
  }
  return sections;
}

/** Question-number prefix by report-included order ("Q3"). */
export function questionNumbers(questions: readonly AnSurveyQuestion[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const q of [...questions].sort((a, b) => a.sort - b.sort)) {
    if (!q.include_in_report || q.qtype === "identity") continue;
    n += 1;
    out.set(q.qkey, n);
  }
  return out;
}

/** Heat for a cross-tab cell: 0–1 of the largest cell, 0 when everything is empty. */
export function cellHeat(value: number, cells: readonly (readonly number[])[]): number {
  let max = 0;
  for (const row of cells) for (const v of row) if (v > max) max = v;
  return max <= 0 ? 0 : value / max;
}
