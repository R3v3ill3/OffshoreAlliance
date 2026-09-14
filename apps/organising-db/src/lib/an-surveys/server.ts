/**
 * Server-side loading + aggregation for the AN survey importer.
 *
 * Shared by the /api/an-surveys routes, the AI lib and the HTML export so
 * "what does the current batch look like" is computed in exactly one
 * place. Everything here runs through the caller's Supabase client, so
 * RLS applies (an invisible import loads as null → the routes answer 404).
 */

import type { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { aggregate, type AggregateRow } from "./aggregate";
import { detectIdentityColumns } from "./dedupe";
import { nameTokensForRow } from "./pii";
import {
  parseStoredBrief,
  parseStoredChartSpec,
  parseStoredNarrative,
  parseStoredReview,
  type ChartSpec,
  type ExtractionBrief,
  type ReportNarrative,
  type ReviewOutput,
} from "./schemas";
import type {
  AnSurveyBatch,
  AnSurveyDetailResponse,
  AnSurveyImport,
  AnSurveyQuestion,
  AnSurveyReportMeta,
  SurveyAggregates,
} from "./types";

export type Db = Awaited<ReturnType<typeof createClient>>;

/** PostgREST page size — the server caps every select at 1000 rows. */
const PAGE = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export type AuthResult =
  | { ok: true; user: User; role: string | null }
  | { ok: false; status: 401 | 403; error: string };

/**
 * getUser() → 401; with `write`, viewers → 403. Routes turn the failure
 * branch straight into `{ success:false, error }`.
 */
export async function authenticate(supabase: Db, opts: { write?: boolean } = {}): Promise<AuthResult> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role ?? null;
  if (opts.write && (!role || role === "viewer")) {
    return { ok: false, status: 403, error: "Insufficient permissions" };
  }
  return { ok: true, user, role };
}

/** Postgres "insufficient privilege" / RLS denial → 403 rather than 500. */
export function isPermissionError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42501") return true;
  return /row-level security|permission denied/i.test(err.message ?? "");
}

// ─── Context ────────────────────────────────────────────────────────────────

/** Raw an_survey_reports row (jsonb columns still unparsed). */
export interface StoredReport {
  id: string;
  import_id: string;
  batch_id: string | null;
  extraction_brief: unknown;
  review: unknown;
  narrative: unknown;
  chart_spec: unknown;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  generated_at: string;
}

/** An aggregate row as loaded from an_survey_responses. */
export interface LoadedRow extends AggregateRow {
  submitted_at: string | null;
}

export interface ImportContext {
  import: AnSurveyImport;
  campaign_name: string | null;
  /** Ordered by sort. */
  questions: AnSurveyQuestion[];
  /** Newest first. */
  batches: AnSurveyBatch[];
  current_batch: AnSurveyBatch | null;
  /** The current report row, or null. */
  report: StoredReport | null;
  /** is_latest rows of the current batch; empty unless loaded with `rows: true`. */
  rows: LoadedRow[];
}

function normaliseBatch(raw: Record<string, unknown>): AnSurveyBatch {
  const headers = Array.isArray(raw.headers) ? (raw.headers as unknown[]).map(String) : [];
  return { ...(raw as unknown as AnSurveyBatch), headers };
}

function normaliseQuestion(raw: Record<string, unknown>): AnSurveyQuestion {
  const options = Array.isArray(raw.options) ? (raw.options as AnSurveyQuestion["options"]) : [];
  const source_columns = Array.isArray(raw.source_columns) ? (raw.source_columns as string[]) : [];
  return { ...(raw as unknown as AnSurveyQuestion), options, source_columns };
}

export async function loadQuestions(supabase: Db, importId: string): Promise<AnSurveyQuestion[]> {
  const { data, error } = await supabase
    .from("an_survey_questions")
    .select("*")
    .eq("import_id", importId)
    .order("sort", { ascending: true });
  if (error) throw new Error(`Failed to load questions: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normaliseQuestion);
}

/**
 * Load an import with its questions, batch history and current report.
 * Returns null when the import does not exist (or RLS hides it).
 */
export async function loadImportContext(
  supabase: Db,
  importId: string,
  opts: { rows?: boolean } = {}
): Promise<ImportContext | null> {
  // A malformed id would make Postgres throw ("invalid input syntax for type uuid");
  // treat it like any other import that does not exist.
  if (!isUuid(importId)) return null;
  const { data: imp, error } = await supabase
    .from("an_survey_imports")
    .select("*, campaigns(name)")
    .eq("id", importId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load import: ${error.message}`);
  if (!imp) return null;

  const { campaigns, ...importRow } = imp as AnSurveyImport & {
    campaigns: { name: string } | { name: string }[] | null;
  };
  const campaign = Array.isArray(campaigns) ? campaigns[0] ?? null : campaigns;

  const [questions, batchesRes, reportRes] = await Promise.all([
    loadQuestions(supabase, importId),
    supabase
      .from("an_survey_import_batches")
      .select("*")
      .eq("import_id", importId)
      .order("uploaded_at", { ascending: false }),
    importRow.current_report_id
      ? supabase.from("an_survey_reports").select("*").eq("id", importRow.current_report_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (batchesRes.error) throw new Error(`Failed to load batches: ${batchesRes.error.message}`);
  if (reportRes.error) throw new Error(`Failed to load report: ${reportRes.error.message}`);

  const batches = ((batchesRes.data ?? []) as Record<string, unknown>[]).map(normaliseBatch);
  const current_batch = batches.find((b) => b.id === importRow.current_batch_id) ?? null;

  const ctx: ImportContext = {
    import: importRow,
    campaign_name: campaign?.name ?? null,
    questions,
    batches,
    current_batch,
    report: (reportRes.data as StoredReport | null) ?? null,
    rows: [],
  };
  if (opts.rows && current_batch) ctx.rows = await loadLatestRows(supabase, ctx.import.id, current_batch);
  return ctx;
}

/** Paged select of the current batch's is_latest rows, in row order. */
async function pageRows<T>(
  supabase: Db,
  importId: string,
  batchId: string,
  columns: string,
  onlyLatest: boolean
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("an_survey_responses")
      .select(columns)
      .eq("import_id", importId)
      .eq("batch_id", batchId);
    if (onlyLatest) query = query.eq("is_latest", true);
    const { data, error } = await query.order("row_index", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load responses: ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

/**
 * is_latest rows of a batch as aggregate rows. name_tokens come from the
 * batch's identity columns so free text can be scrubbed per respondent.
 */
export async function loadLatestRows(supabase: Db, importId: string, batch: AnSurveyBatch): Promise<LoadedRow[]> {
  const identity = detectIdentityColumns(batch.headers);
  const raw = await pageRows<{ row_index: number; submitted_at: string | null; data: Record<string, string> | null }>(
    supabase,
    importId,
    batch.id,
    "row_index, submitted_at, data",
    true
  );
  return raw.map((r) => {
    const data = r.data ?? {};
    return {
      row_index: r.row_index,
      submitted_at: r.submitted_at,
      data,
      name_tokens: nameTokensForRow(data, identity),
    };
  });
}

/** Raw is_latest rows (identity included) for the assessment wizard hand-off. */
export async function loadRawLatestRows(
  supabase: Db,
  importId: string,
  batch: AnSurveyBatch
): Promise<Record<string, string>[]> {
  const raw = await pageRows<{ data: Record<string, string> | null }>(supabase, importId, batch.id, "data", true);
  return raw.map((r) => r.data ?? {});
}

// ─── Report parsing ─────────────────────────────────────────────────────────

export interface ParsedReport {
  id: string;
  batch_id: string | null;
  generated_at: string;
  model: string | null;
  narrative: ReportNarrative;
  chart_spec: ChartSpec;
  extraction_brief: ExtractionBrief | null;
  review: ReviewOutput | null;
  stale: boolean;
}

/**
 * The current report with its jsonb parsed defensively. A row whose
 * narrative or chart_spec no longer validates counts as "no report".
 */
export function parseReport(ctx: ImportContext): ParsedReport | null {
  const r = ctx.report;
  if (!r) return null;
  const narrative = parseStoredNarrative(r.narrative);
  const chart_spec = parseStoredChartSpec(r.chart_spec);
  if (!narrative || !chart_spec) return null;
  return {
    id: r.id,
    batch_id: r.batch_id,
    generated_at: r.generated_at,
    model: r.model,
    narrative,
    chart_spec,
    extraction_brief: parseStoredBrief(r.extraction_brief),
    review: parseStoredReview(r.review),
    stale: r.batch_id !== ctx.import.current_batch_id,
  };
}

export function reportMeta(ctx: ImportContext): AnSurveyReportMeta | null {
  const r = ctx.report;
  if (!r) return null;
  return {
    id: r.id,
    batch_id: r.batch_id,
    generated_at: r.generated_at,
    model: r.model,
    has_brief: parseStoredBrief(r.extraction_brief) !== null,
    stale: r.batch_id !== ctx.import.current_batch_id,
  };
}

export function detailResponse(ctx: ImportContext): AnSurveyDetailResponse {
  return {
    success: true,
    import: ctx.import,
    campaign_name: ctx.campaign_name,
    questions: ctx.questions,
    batches: ctx.batches,
    current_batch: ctx.current_batch,
    report: reportMeta(ctx),
  };
}

// ─── Aggregation ────────────────────────────────────────────────────────────

export type CrossTabPair = { row_qkey: string; col_qkey: string };

export function crossTabsFromSpec(spec: ChartSpec | null | undefined): CrossTabPair[] {
  if (!spec) return [];
  return spec.sections.flatMap((s) =>
    s.kind === "crosstab" ? [{ row_qkey: s.row_qkey, col_qkey: s.col_qkey }] : []
  );
}

export function themesFromSpec(
  spec: ChartSpec | null | undefined
): Record<string, { label: string; row_ids: number[] }[]> {
  const out: Record<string, { label: string; row_ids: number[] }[]> = {};
  for (const s of spec?.sections ?? []) {
    if (s.kind === "free_text") out[s.qkey] = s.themes;
  }
  return out;
}

/** Parse `a:b,c:d` from the report query string. */
export function parseCrossTabParam(value: string | null | undefined): CrossTabPair[] {
  if (!value) return [];
  return value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => {
      const [row, col] = p.split(":").map((s) => s.trim());
      return row && col ? [{ row_qkey: row, col_qkey: col }] : [];
    });
}

export function uniquePairs(pairs: CrossTabPair[]): CrossTabPair[] {
  const seen = new Set<string>();
  const out: CrossTabPair[] = [];
  for (const p of pairs) {
    const key = `${p.row_qkey}|${p.col_qkey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export interface BuildAggregatesOptions {
  /** Extra cross-tab pairs (unioned with the report's chart_spec cross-tabs). */
  crossTabs?: CrossTabPair[];
  /** Keep the scrubbed verbatim free-text responses in the output. */
  includeText?: boolean;
  maxFreeTextResponses?: number;
}

/**
 * Aggregates for the current batch (null when there is none). Uses the
 * context's rows, the current report's cross-tabs + themes, and the
 * batch counts as the headline.
 */
export function buildAggregates(ctx: ImportContext, opts: BuildAggregatesOptions = {}): SurveyAggregates | null {
  const batch = ctx.current_batch;
  if (!batch) return null;
  const report = parseReport(ctx);
  const crossTabs = uniquePairs([...crossTabsFromSpec(report?.chart_spec), ...(opts.crossTabs ?? [])]);
  const agg = aggregate(ctx.questions, ctx.rows, {
    crossTabs,
    themes: themesFromSpec(report?.chart_spec),
    maxFreeTextResponses: opts.maxFreeTextResponses,
    headline: {
      submissions: batch.row_count,
      respondents: batch.response_count,
      duplicates: batch.duplicate_count,
      an_total_records: ctx.import.an_total_records,
      file_name: batch.file_name,
      uploaded_at: batch.uploaded_at,
    },
  });
  if (!opts.includeText) {
    agg.questions = agg.questions.map((q) => (q.qtype === "free_text" ? { ...q, responses: [] } : q));
  }
  return agg;
}
