import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAiModel, getAnthropicClient } from "@/lib/ai/models";
import { generateReport } from "@/lib/an-surveys/ai";
import { knownNumbers } from "@/lib/an-surveys/aggregate";
import { numberGuard } from "@/lib/an-surveys/number-guard";
import {
  extractionBriefSchema,
  parseStoredBrief,
  parseStoredReview,
  reviewOutputSchema,
  type ExtractionBrief,
  type ReviewOutput,
} from "@/lib/an-surveys/schemas";
import {
  authenticate,
  buildAggregates,
  loadImportContext,
  type StoredReport,
} from "@/lib/an-surveys/server";
import { aiFail, dbFail, fail } from "@/lib/an-surveys/route-utils";
import type { AnSurveyGenerateResponse } from "@/lib/an-surveys/types";

/** Align with client `API_FETCH_TIMEOUT_LLM_MS` so Vercel does not exit first. */
export const maxDuration = 120;

const bodySchema = z.union([
  z.object({ reuse_current: z.literal(true) }),
  z.object({
    reuse_current: z.literal(false).optional(),
    extraction_brief: extractionBriefSchema,
    review: reviewOutputSchema.nullable(),
  }),
]);

/**
 * POST /api/an-surveys/[id]/analyse/generate — AI step 3.
 *
 * Writes the narrative + chart choices for the current batch, stores an
 * an_survey_reports row and makes it current. `reuse_current` regenerates
 * with the current report's saved brief/review (the refresh path).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await authenticate(supabase, { write: true });
  if (!auth.ok) return fail(auth.status, auth.error);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Invalid request body");
  const body = parsed.data;

  let ctx;
  try {
    ctx = await loadImportContext(supabase, id, { rows: true });
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to load import");
  }
  if (!ctx) return fail(404, "Import not found");
  if (!ctx.current_batch) return fail(400, "Upload a CSV before generating a report");

  let brief: ExtractionBrief;
  let review: ReviewOutput | null;
  if (body.reuse_current === true) {
    const stored = ctx.report ? parseStoredBrief(ctx.report.extraction_brief) : null;
    if (!stored) return fail(400, "There is no saved brief to reuse — run the review first");
    brief = stored;
    review = ctx.report ? parseStoredReview(ctx.report.review) : null;
  } else {
    brief = body.extraction_brief;
    review = body.review;
  }

  let result;
  try {
    const client = getAnthropicClient();
    const model = await getAiModel("default");
    result = await generateReport(ctx, { brief, model, client });
  } catch (err) {
    return aiFail(err);
  }
  const { sanitised, model, usage } = result;

  const { data: reportRow, error: insErr } = await supabase
    .from("an_survey_reports")
    .insert({
      import_id: id,
      batch_id: ctx.current_batch.id,
      extraction_brief: brief,
      review,
      narrative: sanitised.narrative,
      chart_spec: sanitised.chart_spec,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      generated_by: auth.user.id,
    })
    .select("*")
    .single();
  if (insErr || !reportRow) return dbFail(insErr, "Failed to store report");
  const report = reportRow as StoredReport;

  const { data: updated, error: updErr } = await supabase
    .from("an_survey_imports")
    .update({ current_report_id: report.id })
    .eq("id", id)
    .select("id");
  if (updErr) return dbFail(updErr, "Failed to update import");
  if (!updated || updated.length === 0) return fail(403, "You do not have permission to modify this import");

  // Number guard against the aggregates the new report will be rendered with.
  const aggregates = buildAggregates({ ...ctx, report }, {});
  const number_guard_warnings = aggregates ? numberGuard(sanitised.narrative, knownNumbers(aggregates)) : [];

  return NextResponse.json({
    success: true,
    report_id: report.id,
    model,
    number_guard_warnings,
  } satisfies AnSurveyGenerateResponse);
}
