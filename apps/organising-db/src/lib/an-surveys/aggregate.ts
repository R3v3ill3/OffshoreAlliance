/**
 * Deterministic aggregation over an import's current-batch responses.
 *
 * Every number in the report (dashboard, HTML export, and what Claude is
 * shown) comes from here. Pure and unit-tested; no Supabase, no AI.
 */

import { isTruthyCell } from "@/lib/import/participation-import-shared";
import { cleanCell, optionKey } from "./normalise";
import { scrubText } from "./pii";
import type {
  AnSurveyOption,
  AnSurveyQuestion,
  ChoiceAggregate,
  CrossTab,
  FreeTextAggregate,
  FreeTextTheme,
  MultiSelectAggregate,
  QuestionAggregate,
  SurveyAggregates,
  SurveyHeadline,
} from "./types";

export interface AggregateRow {
  row_index: number;
  data: Record<string, string>;
  /** Name tokens to redact from this row's free text. */
  name_tokens?: string[];
}

export type QuestionLike = Pick<
  AnSurveyQuestion,
  "qkey" | "label" | "qtype" | "source_columns" | "other_column" | "options" | "include_in_report"
>;

export interface AggregateOptions {
  /** Pairs to cross-tabulate (both must be choice-like, included questions). */
  crossTabs?: { row_qkey: string; col_qkey: string }[];
  /** Cap on free-text responses returned per question. */
  maxFreeTextResponses?: number;
  /** Theme membership from a report: qkey → themes. */
  themes?: Record<string, { label: string; row_ids: number[] }[]>;
  headline?: Partial<SurveyHeadline>;
}

const STOP_WORDS = new Set(
  "a an and are as at be but by for from has have i if in into is it its of on or our so than that the their there these they this to was we were what when which who will with would you your not no yes all any can do".split(
    " "
  )
);

export function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/** A meta column promoted to "breakdown" behaves like single_choice. */
export function effectiveType(q: QuestionLike): QuestionLike["qtype"] {
  if (q.qtype === "meta" && q.include_in_report) return "single_choice";
  return q.qtype;
}

export function isChoiceLike(q: QuestionLike): boolean {
  const t = effectiveType(q);
  return t === "single_choice" || t === "scale" || t === "multi_select";
}

/** Answer(s) of a row to a choice-like question as option keys. */
export function answerKeys(q: QuestionLike, row: Record<string, string>): string[] {
  const t = effectiveType(q);
  if (t === "multi_select") {
    const keys: string[] = [];
    for (const col of q.source_columns) {
      if (isTruthyCell(row[col] ?? "")) keys.push(optionKey(col.slice(col.indexOf("_") + 1)));
    }
    if (q.other_column && cleanCell(row[q.other_column])) keys.push("__other__");
    return keys;
  }
  const col = q.source_columns[0];
  const v = col ? cleanCell(row[col]) : "";
  return v ? [optionKey(v)] : [];
}

function ensureOptions(q: QuestionLike, rows: AggregateRow[]): AnSurveyOption[] {
  if (q.options.length > 0 && effectiveType(q) !== "single_choice") return q.options;
  // Single-choice (or promoted meta): make sure every value seen has an option.
  const map = new Map(q.options.map((o) => [o.key, o.label]));
  const col = q.source_columns[0];
  if (col) {
    for (const r of rows) {
      const v = cleanCell(r.data[col]);
      if (v && !map.has(optionKey(v))) map.set(optionKey(v), v);
    }
  }
  return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
}

function aggregateChoice(q: QuestionLike, rows: AggregateRow[]): ChoiceAggregate {
  const options = ensureOptions(q, rows);
  const counts = new Map<string, number>(options.map((o) => [o.key, 0]));
  let answered = 0;
  let numericSum = 0;
  let numericN = 0;
  for (const r of rows) {
    const keys = answerKeys(q, r.data);
    if (keys.length === 0) continue;
    answered++;
    counts.set(keys[0], (counts.get(keys[0]) ?? 0) + 1);
    const n = Number(keys[0]);
    if (Number.isFinite(n)) {
      numericSum += n;
      numericN++;
    }
  }
  const t = effectiveType(q) === "scale" ? "scale" : "single_choice";
  let list = options.map((o) => ({
    key: o.key,
    label: o.label,
    count: counts.get(o.key) ?? 0,
    pct: pct(counts.get(o.key) ?? 0, answered),
  }));
  if (t === "scale") list = list.sort((a, b) => Number(a.label) - Number(b.label));
  else list = list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    qkey: q.qkey,
    qtype: t,
    n_answered: answered,
    no_answer: rows.length - answered,
    options: list,
    mean: t === "scale" && numericN > 0 ? Math.round((numericSum / numericN) * 100) / 100 : null,
  };
}

function aggregateMulti(q: QuestionLike, rows: AggregateRow[]): MultiSelectAggregate {
  const counts = new Map<string, number>(q.options.map((o) => [o.key, 0]));
  let none = 0;
  let totalSelections = 0;
  const otherTexts: string[] = [];
  for (const r of rows) {
    const keys = answerKeys(q, r.data);
    if (keys.length === 0) {
      none++;
      continue;
    }
    totalSelections += keys.length;
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    if (q.other_column) {
      const t = cleanCell(r.data[q.other_column]);
      if (t) otherTexts.push(scrubText(t, { names: r.name_tokens }));
    }
  }
  const n = rows.length;
  return {
    qkey: q.qkey,
    qtype: "multi_select",
    n_respondents: n,
    none_selected: none,
    avg_selections: n > 0 ? Math.round((totalSelections / n) * 100) / 100 : 0,
    options: q.options
      .map((o) => ({ key: o.key, label: o.label, count: counts.get(o.key) ?? 0, pct: pct(counts.get(o.key) ?? 0, n) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    other_texts: otherTexts,
  };
}

export function topTerms(texts: string[], limit = 15): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const w of t.toLowerCase().split(/[^a-z0-9']+/)) {
      if (w.length < 4 || STOP_WORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function aggregateFreeText(
  q: QuestionLike,
  rows: AggregateRow[],
  max: number,
  themes: { label: string; row_ids: number[] }[] | undefined
): FreeTextAggregate {
  const col = q.source_columns[0];
  const responses: { row_id: number; text: string }[] = [];
  for (const r of rows) {
    const t = col ? cleanCell(r.data[col]) : "";
    if (!t) continue;
    responses.push({ row_id: r.row_index, text: scrubText(t, { names: r.name_tokens, maxLength: 1000 }) });
  }
  const answeredIds = new Set(responses.map((r) => r.row_id));
  const themeAgg: FreeTextTheme[] = (themes ?? [])
    .map((t) => {
      const ids = Array.from(new Set(t.row_ids)).filter((id) => answeredIds.has(id));
      return { label: t.label, count: ids.length, row_ids: ids };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
  return {
    qkey: q.qkey,
    qtype: "free_text",
    n_answered: responses.length,
    no_answer: rows.length - responses.length,
    responses: responses.slice(0, max),
    truncated: responses.length > max,
    top_terms: topTerms(responses.map((r) => r.text)),
    themes: themeAgg,
  };
}

export function aggregateQuestion(
  q: QuestionLike,
  rows: AggregateRow[],
  opts: AggregateOptions = {}
): QuestionAggregate | null {
  const t = effectiveType(q);
  if (t === "identity" || t === "meta") return null;
  if (t === "multi_select") return aggregateMulti(q, rows);
  if (t === "free_text") return aggregateFreeText(q, rows, opts.maxFreeTextResponses ?? 500, opts.themes?.[q.qkey]);
  return aggregateChoice(q, rows);
}

export function crossTab(rowQ: QuestionLike, colQ: QuestionLike, rows: AggregateRow[]): CrossTab {
  const rowOptions = ensureOptions(rowQ, rows);
  const colOptions = ensureOptions(colQ, rows);
  const ri = new Map(rowOptions.map((o, i) => [o.key, i]));
  const ci = new Map(colOptions.map((o, i) => [o.key, i]));
  const cells = rowOptions.map(() => colOptions.map(() => 0));
  const rowTotals = rowOptions.map(() => 0);
  const colTotals = colOptions.map(() => 0);
  let n = 0;
  for (const r of rows) {
    const rk = answerKeys(rowQ, r.data);
    const ck = answerKeys(colQ, r.data);
    if (rk.length === 0 || ck.length === 0) continue;
    n++;
    const rowsHit = new Set<number>();
    const colsHit = new Set<number>();
    for (const a of rk) {
      const i = ri.get(a);
      if (i === undefined) continue;
      rowsHit.add(i);
      for (const b of ck) {
        const j = ci.get(b);
        if (j === undefined) continue;
        colsHit.add(j);
        cells[i][j]++;
      }
    }
    for (const i of rowsHit) rowTotals[i]++;
    for (const j of colsHit) colTotals[j]++;
  }
  return {
    row_qkey: rowQ.qkey,
    col_qkey: colQ.qkey,
    row_options: rowOptions,
    col_options: colOptions,
    cells,
    row_totals: rowTotals,
    col_totals: colTotals,
    n,
  };
}

/**
 * Contrast score for ranking candidate cross-tabs when there are too many
 * to send to Claude: how far the cell distribution departs from
 * independence (chi-square-like, unnormalised).
 */
export function crossTabContrast(ct: CrossTab): number {
  if (ct.n === 0) return 0;
  let score = 0;
  for (let i = 0; i < ct.row_options.length; i++) {
    for (let j = 0; j < ct.col_options.length; j++) {
      const expected = (ct.row_totals[i] * ct.col_totals[j]) / ct.n;
      if (expected <= 0) continue;
      const d = ct.cells[i][j] - expected;
      score += (d * d) / expected;
    }
  }
  return score;
}

export function aggregate(
  questions: QuestionLike[],
  rows: AggregateRow[],
  opts: AggregateOptions = {}
): SurveyAggregates {
  const included = questions.filter((q) => q.include_in_report);
  const byKey = new Map(included.map((q) => [q.qkey, q]));
  const questionAggregates = included
    .map((q) => aggregateQuestion(q, rows, opts))
    .filter((a): a is QuestionAggregate => a !== null);
  const crosstabs: CrossTab[] = [];
  for (const pair of opts.crossTabs ?? []) {
    const rq = byKey.get(pair.row_qkey);
    const cq = byKey.get(pair.col_qkey);
    if (!rq || !cq || rq === cq || !isChoiceLike(rq) || !isChoiceLike(cq)) continue;
    crosstabs.push(crossTab(rq, cq, rows));
  }
  return {
    headline: {
      submissions: opts.headline?.submissions ?? rows.length,
      respondents: opts.headline?.respondents ?? rows.length,
      duplicates: opts.headline?.duplicates ?? 0,
      an_total_records: opts.headline?.an_total_records ?? null,
      file_name: opts.headline?.file_name ?? null,
      uploaded_at: opts.headline?.uploaded_at ?? null,
    },
    questions: questionAggregates,
    crosstabs,
  };
}

/** Every pair of choice-like included questions (for the AI step). */
export function candidateCrossTabPairs(questions: QuestionLike[]): { row_qkey: string; col_qkey: string }[] {
  const choice = questions.filter((q) => q.include_in_report && isChoiceLike(q));
  const pairs: { row_qkey: string; col_qkey: string }[] = [];
  for (let i = 0; i < choice.length; i++) {
    for (let j = i + 1; j < choice.length; j++) {
      pairs.push({ row_qkey: choice[i].qkey, col_qkey: choice[j].qkey });
    }
  }
  return pairs;
}

/**
 * The set of numbers the app has actually computed, used by the number
 * guard to spot figures in the narrative that did not come from us.
 */
export function knownNumbers(agg: SurveyAggregates): Set<string> {
  const out = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return;
    out.add(String(n));
    out.add(String(Math.round(n)));
    out.add(n.toFixed(1));
  };
  const h = agg.headline;
  add(h.submissions);
  add(h.respondents);
  add(h.duplicates);
  add(h.an_total_records);
  for (const q of agg.questions) {
    if (q.qtype === "free_text") {
      add(q.n_answered);
      add(q.no_answer);
      for (const t of q.themes) add(t.count);
      for (const t of q.top_terms) add(t.count);
      continue;
    }
    if (q.qtype === "multi_select") {
      add(q.n_respondents);
      add(q.none_selected);
      add(q.avg_selections);
    } else {
      add(q.n_answered);
      add(q.no_answer);
      add(q.mean);
    }
    for (const o of q.options) {
      add(o.count);
      add(o.pct);
    }
  }
  for (const ct of agg.crosstabs) {
    add(ct.n);
    for (const row of ct.cells) for (const c of row) add(c);
    for (const t of ct.row_totals) add(t);
    for (const t of ct.col_totals) add(t);
    // Row-wise shares are what a narrative usually quotes.
    ct.cells.forEach((row, i) => row.forEach((c) => add(pct(c, ct.row_totals[i]))));
    ct.cells.forEach((row) => row.forEach((c, j) => add(pct(c, ct.col_totals[j]))));
  }
  return out;
}
