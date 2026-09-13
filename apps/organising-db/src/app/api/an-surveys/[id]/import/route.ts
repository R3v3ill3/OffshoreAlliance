import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSpreadsheet, SpreadsheetParseError } from "@/lib/import/parse-spreadsheet";
import { dedupeResponses } from "@/lib/an-surveys/dedupe";
import { detectSchema, mergeDetectedSchema } from "@/lib/an-surveys/schema-detect";
import { parseStoredBrief } from "@/lib/an-surveys/schemas";
import { authenticate, loadImportContext, loadQuestions } from "@/lib/an-surveys/server";
import { dbFail, fail } from "@/lib/an-surveys/route-utils";
import type {
  AnSurveyBatch,
  AnSurveyImportConflict,
  AnSurveyImportResponse,
  DetectedQuestion,
} from "@/lib/an-surveys/types";

/** Parsing + chunked inserts of up to 20k rows — align with the LLM client timeout. */
export const maxDuration = 120;

const RESPONSE_CHUNK = 1000;
/** Below this share of the previous headers still present, ask before replacing. */
const MIN_HEADER_OVERLAP = 0.5;

function headerDiff(previous: string[], next: string[]): { added: string[]; removed: string[]; overlap: number } {
  const prev = new Set(previous);
  const cur = new Set(next);
  const added = next.filter((h) => !prev.has(h));
  const removed = previous.filter((h) => !cur.has(h));
  const shared = previous.filter((h) => cur.has(h)).length;
  return { added, removed, overlap: previous.length === 0 ? 1 : shared / previous.length };
}

function questionInsert(importId: string, q: DetectedQuestion): Record<string, unknown> {
  return {
    import_id: importId,
    qkey: q.qkey,
    label: q.label,
    qtype: q.qtype,
    source_columns: q.source_columns,
    other_column: q.other_column,
    options: q.options,
    sort: q.sort,
    include_in_report: q.include_in_report,
  };
}

/**
 * POST /api/an-surveys/[id]/import — multipart `file` (+ `confirm=1`).
 *
 * Parses the CSV/XLSX, dedupes submissions per respondent, stores a new
 * batch + rows, detects or merges the question schema, makes the batch
 * current and drops the previous batch's rows (its header row stays).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await authenticate(supabase, { write: true });
  if (!auth.ok) return fail(auth.status, auth.error);

  let ctx;
  try {
    ctx = await loadImportContext(supabase, id);
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to load import");
  }
  if (!ctx) return fail(404, "Import not found");

  let file: File | null = null;
  let confirm = "";
  try {
    const formData = await request.formData();
    const f = formData.get("file");
    file = f instanceof File ? f : null;
    confirm = String(formData.get("confirm") ?? "");
  } catch {
    return fail(400, "Expected multipart form data");
  }
  if (!file) return fail(400, "No file provided");

  let parsed;
  try {
    parsed = parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (err) {
    if (err instanceof SpreadsheetParseError) return fail(err.status, err.message);
    return fail(400, err instanceof Error ? err.message : "Could not read file");
  }
  if (parsed.rows.length === 0) return fail(400, "The file has a header row but no responses");

  const { rows, summary } = dedupeResponses(parsed.headers, parsed.rows);

  const previous = ctx.current_batch;
  let header_diff: { added: string[]; removed: string[] } | null = null;
  if (previous) {
    const diff = headerDiff(previous.headers, parsed.headers);
    header_diff = { added: diff.added, removed: diff.removed };
    if (diff.overlap < MIN_HEADER_OVERLAP && confirm !== "1") {
      return NextResponse.json(
        {
          success: false,
          error: "The new file's columns barely match the current data. Confirm to replace it anyway.",
          needs_confirm: true,
          header_diff,
        } satisfies AnSurveyImportConflict,
        { status: 409 }
      );
    }
  }

  // 1. Batch header row.
  const { data: batchRow, error: batchErr } = await supabase
    .from("an_survey_import_batches")
    .insert({
      import_id: id,
      file_name: file.name,
      headers: parsed.headers,
      row_count: summary.rowCount,
      response_count: summary.responseCount,
      duplicate_count: summary.duplicateCount,
      uploaded_by: auth.user.id,
    })
    .select("*")
    .single();
  if (batchErr || !batchRow) return dbFail(batchErr, "Failed to create batch");
  const batch = { ...(batchRow as AnSurveyBatch), headers: parsed.headers };

  const rollback = async () => {
    await supabase.from("an_survey_import_batches").delete().eq("id", batch.id);
  };

  // 2. Rows, in chunks.
  for (let i = 0; i < rows.length; i += RESPONSE_CHUNK) {
    const chunk = rows.slice(i, i + RESPONSE_CHUNK).map((r) => ({
      import_id: id,
      batch_id: batch.id,
      row_index: r.row_index,
      respondent_key: r.respondent_key,
      submitted_at: r.submitted_at,
      is_latest: r.is_latest,
      data: r.data,
    }));
    const { error } = await supabase.from("an_survey_responses").insert(chunk);
    if (error) {
      await rollback();
      return dbFail(error, "Failed to store responses");
    }
  }

  // 3. Schema: detect on first upload, merge on refresh.
  const detected = detectSchema(parsed.headers, parsed.rows);
  const now = new Date().toISOString();
  if (ctx.questions.length === 0) {
    if (detected.length > 0) {
      const { error } = await supabase
        .from("an_survey_questions")
        .insert(detected.map((q) => questionInsert(id, q)));
      if (error) {
        await rollback();
        return dbFail(error, "Failed to store question schema");
      }
    }
  } else {
    const merged = mergeDetectedSchema(ctx.questions, detected, parsed.headers);
    if (merged.add.length > 0) {
      const { error } = await supabase
        .from("an_survey_questions")
        .insert(merged.add.map((q) => questionInsert(id, q)));
      if (error) {
        await rollback();
        return dbFail(error, "Failed to add new questions");
      }
    }
    const newlyMissing = merged.missing.filter((q) => !q.missing_since).map((q) => q.id);
    if (newlyMissing.length > 0) {
      const { error } = await supabase
        .from("an_survey_questions")
        .update({ missing_since: now })
        .in("id", newlyMissing);
      if (error) return dbFail(error, "Failed to flag missing questions");
    }
    const returned = merged.returned.map((q) => q.id);
    if (returned.length > 0) {
      const { error } = await supabase
        .from("an_survey_questions")
        .update({ missing_since: null })
        .in("id", returned);
      if (error) return dbFail(error, "Failed to clear missing flags");
    }
  }

  // 4. Make the batch current.
  const { data: updated, error: updErr } = await supabase
    .from("an_survey_imports")
    .update({ current_batch_id: batch.id })
    .eq("id", id)
    .select("id");
  if (updErr || !updated || updated.length === 0) {
    await rollback();
    return updErr ? dbFail(updErr, "Failed to update import") : fail(403, "You do not have permission to modify this import");
  }

  // 5. Drop the superseded batch's rows (its header row stays for the audit trail).
  if (previous && previous.id !== batch.id) {
    const { error } = await supabase.from("an_survey_responses").delete().eq("batch_id", previous.id);
    if (error) console.error("an-surveys/import: failed to delete previous batch rows", error.message);
  }

  let questions;
  try {
    questions = await loadQuestions(supabase, id);
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to reload questions");
  }

  const can_regenerate = ctx.report != null && parseStoredBrief(ctx.report.extraction_brief) !== null;

  return NextResponse.json({
    success: true,
    batch,
    questions,
    header_diff,
    can_regenerate,
  } satisfies AnSurveyImportResponse);
}
