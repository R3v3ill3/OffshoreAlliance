/**
 * Shared fixture builder: an ImportContext over the synthetic ROV form
 * export, exactly as the server would load it (is_latest rows only, name
 * tokens from the identity columns).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpreadsheet } from "@/lib/import/parse-spreadsheet";
import { dedupeResponses } from "../dedupe";
import { nameTokensForRow } from "../pii";
import { detectSchema } from "../schema-detect";
import type { ImportContext, LoadedRow } from "../server";
import type { AnSurveyBatch, AnSurveyImport, AnSurveyQuestion } from "../types";

export const FIXTURE = join(__dirname, "fixtures", "rov-form.synthetic.csv");

export function buildFixtureContext(overrides: Partial<ImportContext> = {}): ImportContext {
  const parsed = parseSpreadsheet(readFileSync(FIXTURE), "rov-form.synthetic.csv");
  const { rows, summary, identity } = dedupeResponses(parsed.headers, parsed.rows);
  const detected = detectSchema(parsed.headers, parsed.rows);

  const importRow: AnSurveyImport = {
    id: "11111111-1111-4111-8111-111111111111",
    campaign_id: null,
    title: "ROV roles — register your interest",
    source_kind: "form",
    an_resource_type: "form",
    an_resource_id: "abc",
    an_browser_url: null,
    an_total_records: 10,
    an_last_synced_at: null,
    current_batch_id: "22222222-2222-4222-8222-222222222222",
    current_report_id: null,
    created_by: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
  };
  const batch: AnSurveyBatch = {
    id: importRow.current_batch_id!,
    import_id: importRow.id,
    file_name: "rov-form.synthetic.csv",
    headers: parsed.headers,
    row_count: summary.rowCount,
    response_count: summary.responseCount,
    duplicate_count: summary.duplicateCount,
    uploaded_by: null,
    uploaded_at: "2026-09-12T01:00:00.000Z",
  };
  const questions: AnSurveyQuestion[] = detected.map((q, i) => ({
    ...q,
    id: `q-${i}`,
    import_id: importRow.id,
    user_edited: false,
    missing_since: null,
  }));
  const loaded: LoadedRow[] = rows
    .filter((r) => r.is_latest)
    .map((r) => ({
      row_index: r.row_index,
      submitted_at: r.submitted_at,
      data: r.data,
      name_tokens: nameTokensForRow(r.data, identity),
    }));

  return {
    import: importRow,
    campaign_name: null,
    questions,
    batches: [batch],
    current_batch: batch,
    report: null,
    rows: loaded,
    ...overrides,
  };
}
