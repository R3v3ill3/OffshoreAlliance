import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticate, loadImportContext, loadRawLatestRows } from "@/lib/an-surveys/server";
import { fail } from "@/lib/an-surveys/route-utils";
import type { AnSurveyRowsResponse } from "@/lib/an-surveys/types";

/**
 * GET /api/an-surveys/[id]/rows
 *
 * The current batch's is_latest rows, raw (identity columns included), to
 * seed the participation-import wizard. Campaign-linked imports and
 * non-viewers only — this is the one route that returns identity data.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await authenticate(supabase, { write: true });
  if (!auth.ok) return fail(auth.status, auth.error);

  try {
    const ctx = await loadImportContext(supabase, id);
    if (!ctx) return fail(404, "Import not found");
    if (ctx.import.campaign_id === null) {
      return fail(400, "Assessment mapping is only available for campaign-linked imports");
    }
    if (!ctx.current_batch) return fail(400, "No data has been uploaded yet");

    const rows = await loadRawLatestRows(supabase, ctx.import.id, ctx.current_batch);
    return NextResponse.json({
      success: true,
      fileName: ctx.current_batch.file_name ?? `${ctx.import.title}.csv`,
      headers: ctx.current_batch.headers,
      rows,
    } satisfies AnSurveyRowsResponse);
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to load rows");
  }
}
