/**
 * DELETE /api/campaigns/[id]/emails/[draftId]/attachments/[attachmentId]
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmailDraft } from "@/lib/email/authorize-email-draft";
import { EMAIL_ATTACHMENT_BUCKET } from "@/lib/email/draft-attachments";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; draftId: string; attachmentId: string }> },
) {
  const { id, draftId: draftIdParam, attachmentId: attachmentParam } = await ctx.params;
  const campaignId = Number(id);
  const draftId = Number(draftIdParam);
  const attachmentId = Number(attachmentParam);
  const auth = await authorizeEmailDraft(campaignId, draftId, "write");
  if ("error" in auth) return auth.error;
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid attachment id" }, { status: 400 });
  }

  const { data: row, error } = await auth.admin
    .from("email_draft_attachments")
    .select("attachment_id, storage_bucket, storage_path")
    .eq("attachment_id", attachmentId)
    .eq("draft_id", draftId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ success: false, error: "Attachment not found" }, { status: 404 });
  }

  const bucket = row.storage_bucket || EMAIL_ATTACHMENT_BUCKET;
  const removed = await auth.admin.storage.from(bucket).remove([row.storage_path]);
  if (removed.error) {
    return NextResponse.json({ success: false, error: removed.error.message }, { status: 500 });
  }

  const deleted = await auth.admin
    .from("email_draft_attachments")
    .delete()
    .eq("attachment_id", attachmentId)
    .eq("draft_id", draftId);
  if (deleted.error) {
    return NextResponse.json({ success: false, error: deleted.error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
