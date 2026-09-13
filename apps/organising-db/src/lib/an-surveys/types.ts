/**
 * Shared contracts for the Action Network survey/form importer + report.
 *
 * Imported by the client (Surveys & Forms pages, campaign sub-tab) and the
 * server routes under /api/an-surveys/* so the shapes live in one place —
 * mirrors participation-import-shared.ts.
 */

import type { ChartSpec, ExtractionBrief, ReportNarrative, ReviewOutput } from "./schemas";

// ─── Rows (mirror the an_survey_* tables) ────────────────────────────────────

export type AnSurveyQuestionType =
  | "single_choice"
  | "multi_select"
  | "scale"
  | "free_text"
  | "identity"
  | "meta";

export const AN_SURVEY_QUESTION_TYPES: { value: AnSurveyQuestionType; label: string }[] = [
  { value: "single_choice", label: "Single choice" },
  { value: "multi_select", label: "Multi-select" },
  { value: "scale", label: "Scale (numeric)" },
  { value: "free_text", label: "Free text" },
  { value: "meta", label: "Metadata / breakdown" },
  { value: "identity", label: "Identity (never reported)" },
];

export type AnSurveySourceKind = "form" | "survey";

export interface AnSurveyOption {
  /** Normalised key (lower-case, whitespace/dash-collapsed). */
  key: string;
  /** Display label — the first spelling seen in the data. */
  label: string;
}

export interface AnSurveyQuestion {
  id: string;
  import_id: string;
  qkey: string;
  label: string;
  qtype: AnSurveyQuestionType;
  source_columns: string[];
  other_column: string | null;
  options: AnSurveyOption[];
  sort: number;
  include_in_report: boolean;
  user_edited: boolean;
  missing_since: string | null;
}

export interface AnSurveyImport {
  id: string;
  campaign_id: number | null;
  title: string;
  source_kind: AnSurveySourceKind;
  an_resource_type: AnSurveySourceKind | null;
  an_resource_id: string | null;
  an_browser_url: string | null;
  an_total_records: number | null;
  an_last_synced_at: string | null;
  current_batch_id: string | null;
  current_report_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnSurveyBatch {
  id: string;
  import_id: string;
  file_name: string | null;
  headers: string[];
  row_count: number;
  response_count: number;
  duplicate_count: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface AnSurveyReportMeta {
  id: string;
  batch_id: string | null;
  generated_at: string;
  model: string | null;
  has_brief: boolean;
  /** True when the report was generated against a batch that is no longer current. */
  stale: boolean;
}

// ─── Detection output (before persistence) ──────────────────────────────────

export interface DetectedQuestion {
  qkey: string;
  label: string;
  qtype: AnSurveyQuestionType;
  source_columns: string[];
  other_column: string | null;
  options: AnSurveyOption[];
  sort: number;
  include_in_report: boolean;
}

// ─── Aggregates (all numbers come from aggregate.ts) ────────────────────────

export interface OptionCount {
  key: string;
  label: string;
  count: number;
  /** Share of answered respondents (0–100, one decimal). For multi_select: share of respondents. */
  pct: number;
}

export interface ChoiceAggregate {
  qkey: string;
  qtype: "single_choice" | "scale";
  n_answered: number;
  no_answer: number;
  options: OptionCount[];
  /** Scale only: mean of numeric answers. */
  mean: number | null;
}

export interface MultiSelectAggregate {
  qkey: string;
  qtype: "multi_select";
  n_respondents: number;
  none_selected: number;
  avg_selections: number;
  options: OptionCount[];
  other_texts: string[];
}

export interface FreeTextResponse {
  /** an_survey_responses.row_index — stable within a batch; used for theme membership. */
  row_id: number;
  text: string;
}

export interface FreeTextTheme {
  label: string;
  count: number;
  row_ids: number[];
}

export interface FreeTextAggregate {
  qkey: string;
  qtype: "free_text";
  n_answered: number;
  no_answer: number;
  responses: FreeTextResponse[];
  truncated: boolean;
  top_terms: { term: string; count: number }[];
  /** App-counted from the report's theme row_ids, when a report exists. */
  themes: FreeTextTheme[];
}

export type QuestionAggregate = ChoiceAggregate | MultiSelectAggregate | FreeTextAggregate;

export interface CrossTab {
  row_qkey: string;
  col_qkey: string;
  row_options: AnSurveyOption[];
  col_options: AnSurveyOption[];
  /** cells[rowIdx][colIdx] = respondents in both. */
  cells: number[][];
  row_totals: number[];
  col_totals: number[];
  /** Respondents who answered both questions. */
  n: number;
}

export interface SurveyHeadline {
  submissions: number;
  respondents: number;
  duplicates: number;
  an_total_records: number | null;
  file_name: string | null;
  uploaded_at: string | null;
}

export interface SurveyAggregates {
  headline: SurveyHeadline;
  questions: QuestionAggregate[];
  crosstabs: CrossTab[];
}

// ─── API contracts ──────────────────────────────────────────────────────────

export interface AnSurveyListItem extends AnSurveyImport {
  campaign_name: string | null;
  current_batch: Pick<
    AnSurveyBatch,
    "id" | "file_name" | "row_count" | "response_count" | "duplicate_count" | "uploaded_at"
  > | null;
  report_state: "none" | "current" | "stale";
  report_generated_at: string | null;
}

export interface AnSurveyListResponse {
  success: true;
  imports: AnSurveyListItem[];
}

export interface AnSurveyCreateRequest {
  title: string;
  source_kind: AnSurveySourceKind;
  campaign_id?: number | null;
  an?: {
    resource_type: AnSurveySourceKind;
    resource_id: string;
    browser_url?: string | null;
    total_records?: number | null;
  } | null;
}

export interface AnSurveyDetailResponse {
  success: true;
  import: AnSurveyImport;
  campaign_name: string | null;
  questions: AnSurveyQuestion[];
  batches: AnSurveyBatch[];
  current_batch: AnSurveyBatch | null;
  report: AnSurveyReportMeta | null;
}

export interface AnSurveyQuestionPatch {
  qkey: string;
  label?: string;
  qtype?: AnSurveyQuestionType;
  include_in_report?: boolean;
}

export interface AnSurveyPatchRequest {
  title?: string;
  campaign_id?: number | null;
  questions?: AnSurveyQuestionPatch[];
}

export interface AnSurveyImportResponse {
  success: true;
  batch: AnSurveyBatch;
  questions: AnSurveyQuestion[];
  header_diff: { added: string[]; removed: string[] } | null;
  /** Set when a report existed and can be regenerated with its saved brief. */
  can_regenerate: boolean;
}

/** 409 body when the new file's headers barely overlap the previous batch. */
export interface AnSurveyImportConflict {
  success: false;
  error: string;
  needs_confirm: true;
  header_diff: { added: string[]; removed: string[] };
}

export interface AnSurveyRowsResponse {
  success: true;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface AnSurveyReportResponse {
  success: true;
  import: AnSurveyImport;
  questions: AnSurveyQuestion[];
  /** Null until a batch has been uploaded. */
  aggregates: SurveyAggregates | null;
  report: {
    id: string;
    batch_id: string | null;
    generated_at: string;
    model: string | null;
    narrative: ReportNarrative;
    chart_spec: ChartSpec;
    extraction_brief: ExtractionBrief | null;
    review: ReviewOutput | null;
    stale: boolean;
    number_guard_warnings: string[];
  } | null;
}

export interface AnSurveyReviewResponse {
  success: true;
  review: ReviewOutput;
  model: string;
}

/**
 * Step 3 input. Either send a fresh brief (+ the step-1 review the client is
 * holding, so it is persisted with the report), or set `reuse_current` to
 * regenerate against the current batch with the current report's saved
 * brief and review (the "refresh by re-upload" path).
 */
export type AnSurveyGenerateRequest =
  | { reuse_current: true }
  | { reuse_current?: false; extraction_brief: ExtractionBrief; review: ReviewOutput | null };

export interface AnSurveyGenerateResponse {
  success: true;
  report_id: string;
  model: string;
  number_guard_warnings: string[];
}

export interface AnSurveyActionListItem {
  resource_type: AnSurveySourceKind;
  id: string;
  title: string;
  browser_url: string | null;
  created_date: string | null;
  total_records: number | null;
  /** Import already linked to this AN action, if any. */
  linked_import_id: string | null;
  linked_import_title: string | null;
}

export interface AnSurveyActionsResponse {
  success: true;
  actions: AnSurveyActionListItem[];
}

/** Derive the report state shown on list rows. */
export function reportStateFor(
  imp: Pick<AnSurveyImport, "current_batch_id" | "current_report_id">,
  reportBatchId: string | null | undefined
): "none" | "current" | "stale" {
  if (!imp.current_report_id) return "none";
  if (reportBatchId && imp.current_batch_id && reportBatchId === imp.current_batch_id) {
    return "current";
  }
  return "stale";
}
