import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authenticate, detailResponse, isUuid, loadImportContext } from "@/lib/an-surveys/server";
import { dbFail, fail } from "@/lib/an-surveys/route-utils";

type Params = { params: Promise<{ id: string }> };

/** GET /api/an-surveys/[id] — import + questions + batches + report meta. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return fail(400, "Invalid import ID");

  const supabase = await createClient();
  const auth = await authenticate(supabase);
  if (!auth.ok) return fail(auth.status, auth.error);

  try {
    const ctx = await loadImportContext(supabase, id);
    if (!ctx) return fail(404, "Import not found");
    return NextResponse.json(detailResponse(ctx));
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to load import");
  }
}

const questionTypeSchema = z.enum(["single_choice", "multi_select", "scale", "free_text", "identity", "meta"]);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  campaign_id: z.number().int().positive().nullable().optional(),
  questions: z
    .array(
      z.object({
        qkey: z.string().min(1),
        label: z.string().trim().min(1).max(200).optional(),
        qtype: questionTypeSchema.optional(),
        include_in_report: z.boolean().optional(),
      })
    )
    .max(200)
    .optional(),
});

/**
 * PATCH /api/an-surveys/[id] — title, campaign link/unlink, question edits
 * (label / type / include flag; each edited question gets user_edited).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return fail(400, "Invalid import ID");

  const supabase = await createClient();
  const auth = await authenticate(supabase, { write: true });
  if (!auth.ok) return fail(auth.status, auth.error);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Invalid request body");
  const body = parsed.data;

  let ctx;
  try {
    ctx = await loadImportContext(supabase, id);
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to load import");
  }
  if (!ctx) return fail(404, "Import not found");

  // Validate question edits before touching anything.
  const byKey = new Map(ctx.questions.map((q) => [q.qkey, q]));
  const questionUpdates: { qkey: string; patch: Record<string, unknown> }[] = [];
  for (const edit of body.questions ?? []) {
    const stored = byKey.get(edit.qkey);
    if (!stored) return fail(400, `Unknown question "${edit.qkey}"`);
    const qtype = edit.qtype ?? stored.qtype;
    let include = edit.include_in_report ?? stored.include_in_report;
    if (qtype === "identity") {
      if (edit.include_in_report === true) {
        return fail(400, "Identity columns cannot be included in the report");
      }
      include = false;
    }
    const patch: Record<string, unknown> = { user_edited: true };
    if (edit.label !== undefined) patch.label = edit.label;
    if (edit.qtype !== undefined) patch.qtype = edit.qtype;
    if (edit.include_in_report !== undefined || include !== stored.include_in_report) {
      patch.include_in_report = include;
    }
    questionUpdates.push({ qkey: edit.qkey, patch });
  }

  const importPatch: Record<string, unknown> = {};
  if (body.title !== undefined) importPatch.title = body.title;
  if (body.campaign_id !== undefined) {
    if (body.campaign_id !== null) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("campaign_id")
        .eq("campaign_id", body.campaign_id)
        .maybeSingle();
      if (!campaign) return fail(404, "Campaign not found");
    }
    importPatch.campaign_id = body.campaign_id;
  }

  if (Object.keys(importPatch).length > 0) {
    const { data, error } = await supabase.from("an_survey_imports").update(importPatch).eq("id", id).select("id");
    if (error) return dbFail(error, "Failed to update import");
    if (!data || data.length === 0) return fail(403, "You do not have permission to modify this import");
  }

  for (const { qkey, patch } of questionUpdates) {
    const { data, error } = await supabase
      .from("an_survey_questions")
      .update(patch)
      .eq("import_id", id)
      .eq("qkey", qkey)
      .select("id");
    if (error) return dbFail(error, "Failed to update question");
    if (!data || data.length === 0) return fail(403, "You do not have permission to modify this import");
  }

  try {
    const fresh = await loadImportContext(supabase, id);
    if (!fresh) return fail(404, "Import not found");
    return NextResponse.json(detailResponse(fresh));
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to reload import");
  }
}

/** DELETE /api/an-surveys/[id] — remove the import; children cascade. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return fail(400, "Invalid import ID");

  const supabase = await createClient();
  const auth = await authenticate(supabase, { write: true });
  if (!auth.ok) return fail(auth.status, auth.error);

  const { data: existing } = await supabase.from("an_survey_imports").select("id").eq("id", id).maybeSingle();
  if (!existing) return fail(404, "Import not found");

  const { data, error } = await supabase.from("an_survey_imports").delete().eq("id", id).select("id");
  if (error) return dbFail(error, "Failed to delete import");
  if (!data || data.length === 0) return fail(403, "You do not have permission to delete this import");

  return NextResponse.json({ success: true });
}
