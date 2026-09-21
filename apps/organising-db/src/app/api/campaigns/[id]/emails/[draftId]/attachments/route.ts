/**
 * GET  /api/campaigns/[id]/emails/[draftId]/attachments
 * POST /api/campaigns/[id]/emails/[draftId]/attachments
 *
 * Files are uploaded straight to Storage by the browser (a 10 MB PDF does
 * not fit through the platform request-body limit). POST only records the
 * object after checking the path, type, and size. POST { document_id }
 * copies a campaign-library document into the same bucket.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeEmailDraft } from "@/lib/email/authorize-email-draft";
import {
  EMAIL_ATTACHMENT_BUCKET,
  attachmentQuotaError,
  contentTypeForFilename,
  documentAttachmentError,
  draftAttachmentStoragePath,
  isDraftAttachmentPath,
  safeAttachmentFilename,
} from "@/lib/email/draft-attachments";
import { listDraftAttachments } from "@/lib/email/load-draft-attachments";

const ATTACHMENT_COLUMNS =
  "attachment_id, filename, content_type, byte_size, storage_bucket, storage_path, source_document_id, created_at";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; draftId: string }> },
) {
  const { id, draftId: draftIdParam } = await ctx.params;
  const auth = await authorizeEmailDraft(Number(id), Number(draftIdParam), "read");
  if ("error" in auth) return auth.error;

  try {
    const attachments = await listDraftAttachments(auth.admin, Number(draftIdParam));
    return NextResponse.json({ attachments });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list attachments" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; draftId: string }> },
) {
  const { id, draftId: draftIdParam } = await ctx.params;
  const campaignId = Number(id);
  const draftId = Number(draftIdParam);
  const auth = await authorizeEmailDraft(campaignId, draftId, "write");
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => null)) as {
    storage_path?: string;
    filename?: string;
    document_id?: number;
  } | null;
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.document_id != null) {
      return await attachLibraryDocument(auth, campaignId, draftId, Number(body.document_id));
    }
    return await registerUploadedFile(auth, campaignId, draftId, body);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Could not add attachment" },
      { status: 500 },
    );
  }
}

type Admin = ReturnType<typeof createAdminClient>;

async function registerUploadedFile(
  auth: { user: { id: string }; admin: Admin },
  campaignId: number,
  draftId: number,
  body: { storage_path?: string; filename?: string },
) {
  const storagePath = body.storage_path?.trim() ?? "";
  const filename = safeAttachmentFilename(body.filename ?? "");
  const storedName = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  if (!isDraftAttachmentPath(campaignId, draftId, storagePath)) {
    return NextResponse.json(
      { success: false, error: "Attachment was not uploaded to this draft." },
      { status: 400 },
    );
  }
  const typeError =
    documentAttachmentError({ name: filename, size: 1 }) ??
    documentAttachmentError({ name: storedName, size: 1 });
  if (typeError) {
    await removeObject(auth.admin, storagePath);
    return NextResponse.json({ success: false, error: typeError }, { status: 400 });
  }

  const byteSize = await storedObjectSize(auth.admin, storagePath);
  if (byteSize == null) {
    return NextResponse.json(
      { success: false, error: "Uploaded file was not found. Try attaching it again." },
      { status: 400 },
    );
  }
  const sizeError = documentAttachmentError({ name: filename, size: byteSize });
  if (sizeError) {
    await removeObject(auth.admin, storagePath);
    return NextResponse.json({ success: false, error: sizeError }, { status: 400 });
  }

  const existing = await listDraftAttachments(auth.admin, draftId);
  const quotaError = attachmentQuotaError(existing, byteSize);
  if (quotaError) {
    await removeObject(auth.admin, storagePath);
    return NextResponse.json({ success: false, error: quotaError }, { status: 400 });
  }

  return insertAttachment(auth, {
    draftId,
    campaignId,
    storagePath,
    filename,
    byteSize,
    sourceDocumentId: null,
  });
}

async function attachLibraryDocument(
  auth: { user: { id: string }; admin: Admin },
  campaignId: number,
  draftId: number,
  documentId: number,
) {
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return NextResponse.json(
      { success: false, error: "document_id is required" },
      { status: 400 },
    );
  }

  const { data: document, error } = await auth.admin
    .from("documents")
    .select("document_id, campaign_id, file_path, title")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!document || document.campaign_id !== campaignId) {
    return NextResponse.json(
      { success: false, error: "That document is not in this campaign library." },
      { status: 404 },
    );
  }

  const sourceName = String(document.file_path ?? "").split("/").pop() || String(document.title ?? "document");
  const filename = safeAttachmentFilename(sourceName);
  const typeError = documentAttachmentError({ name: filename, size: 1 });
  if (typeError) {
    return NextResponse.json({ success: false, error: typeError }, { status: 400 });
  }

  const downloaded = await auth.admin.storage
    .from("campaign-documents")
    .download(document.file_path);
  if (downloaded.error || !downloaded.data) {
    return NextResponse.json(
      {
        success: false,
        error: downloaded.error?.message ?? "Could not read that library document.",
      },
      { status: 500 },
    );
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const sizeError = documentAttachmentError({ name: filename, size: bytes.byteLength });
  if (sizeError) {
    return NextResponse.json({ success: false, error: sizeError }, { status: 400 });
  }
  const existing = await listDraftAttachments(auth.admin, draftId);
  const quotaError = attachmentQuotaError(existing, bytes.byteLength);
  if (quotaError) {
    return NextResponse.json({ success: false, error: quotaError }, { status: 400 });
  }

  const storagePath = draftAttachmentStoragePath(campaignId, draftId, filename);
  const uploaded = await auth.admin.storage.from(EMAIL_ATTACHMENT_BUCKET).upload(storagePath, bytes, {
    contentType: contentTypeForFilename(filename) ?? "application/octet-stream",
    upsert: false,
  });
  if (uploaded.error) {
    return NextResponse.json({ success: false, error: uploaded.error.message }, { status: 500 });
  }

  return insertAttachment(auth, {
    draftId,
    campaignId,
    storagePath,
    filename,
    byteSize: bytes.byteLength,
    sourceDocumentId: documentId,
  });
}

async function insertAttachment(
  auth: { user: { id: string }; admin: Admin },
  input: {
    draftId: number;
    campaignId: number;
    storagePath: string;
    filename: string;
    byteSize: number;
    sourceDocumentId: number | null;
  },
) {
  const { data, error } = await auth.admin
    .from("email_draft_attachments")
    .insert({
      draft_id: input.draftId,
      campaign_id: input.campaignId,
      storage_bucket: EMAIL_ATTACHMENT_BUCKET,
      storage_path: input.storagePath,
      filename: input.filename,
      content_type: contentTypeForFilename(input.filename),
      byte_size: input.byteSize,
      source_document_id: input.sourceDocumentId,
      created_by: auth.user.id,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();
  if (error) {
    await removeObject(auth.admin, input.storagePath);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, attachment: data });
}

async function storedObjectSize(admin: Admin, storagePath: string): Promise<number | null> {
  const slash = storagePath.lastIndexOf("/");
  const folder = storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);
  const listed = await admin.storage.from(EMAIL_ATTACHMENT_BUCKET).list(folder, {
    limit: 100,
    search: name,
  });
  if (listed.error) throw listed.error;
  const match = (listed.data ?? []).find((item) => item.name === name);
  if (!match) {
    const downloaded = await admin.storage.from(EMAIL_ATTACHMENT_BUCKET).download(storagePath);
    if (downloaded.error || !downloaded.data) return null;
    return downloaded.data.size;
  }
  const raw = match.metadata?.size;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && Number.isFinite(Number(raw))) return Number(raw);
  const downloaded = await admin.storage.from(EMAIL_ATTACHMENT_BUCKET).download(storagePath);
  if (downloaded.error || !downloaded.data) return null;
  return downloaded.data.size;
}

async function removeObject(admin: Admin, storagePath: string) {
  await admin.storage.from(EMAIL_ATTACHMENT_BUCKET).remove([storagePath]);
}
