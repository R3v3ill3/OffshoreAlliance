import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAiModel, getAnthropicClient } from "@/lib/ai/models";
import { reviewImport } from "@/lib/an-surveys/ai";
import { authenticate, loadImportContext } from "@/lib/an-surveys/server";
import { aiFail, fail } from "@/lib/an-surveys/route-utils";
import type { AnSurveyReviewResponse } from "@/lib/an-surveys/types";

/** Align with client `API_FETCH_TIMEOUT_LLM_MS` so Vercel does not exit first. */
export const maxDuration = 120;

/**
 * POST /api/an-surveys/[id]/analyse/review — AI step 1.
 *
 * Reviews the current batch (schema, data quality, clarifying questions).
 * Nothing is persisted; the client holds the review and sends it back
 * with the brief at generate time.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await authenticate(supabase, { write: true });
  if (!auth.ok) return fail(auth.status, auth.error);

  let ctx;
  try {
    ctx = await loadImportContext(supabase, id, { rows: true });
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to load import");
  }
  if (!ctx) return fail(404, "Import not found");
  if (!ctx.current_batch) return fail(400, "Upload a CSV before running the review");

  try {
    const client = getAnthropicClient();
    const model = await getAiModel("default");
    const { output, model: usedModel } = await reviewImport(ctx, { model, client });
    return NextResponse.json({ success: true, review: output, model: usedModel } satisfies AnSurveyReviewResponse);
  } catch (err) {
    return aiFail(err);
  }
}
