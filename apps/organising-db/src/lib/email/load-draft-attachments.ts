/**
 * Load the files saved against a campaign email draft and shape them for
 * SendGrid or Microsoft Graph. Callers pass a service-role client — the
 * cron has no user session, and send routes must not depend on the
 * organiser's storage JWT staying valid for the whole batch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutboundEmail } from "@/lib/email/provider";
import {
  EMAIL_ATTACHMENT_BUCKET,
  MAX_DRAFT_ATTACHMENT_BYTES,
  MAX_DRAFT_ATTACHMENT_TOTAL_BYTES,
  contentTypeForFilename,
  type EmailDraftAttachment,
} from "@/lib/email/draft-attachments";
import type { GraphFileAttachment } from "@/lib/integrations/microsoft-graph";

interface AttachmentRow {
  attachment_id: number;
  filename: string;
  content_type: string | null;
  byte_size: number;
  storage_bucket: string;
  storage_path: string;
}

export interface LoadedDraftAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  contentBase64: string;
}

export async function listDraftAttachments(
  supabase: SupabaseClient,
  draftId: number,
): Promise<EmailDraftAttachment[]> {
  const { data, error } = await supabase
    .from("email_draft_attachments")
    .select(
      "attachment_id, filename, content_type, byte_size, storage_bucket, storage_path, source_document_id, created_at",
    )
    .eq("draft_id", draftId)
    .order("attachment_id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmailDraftAttachment[];
}

export async function loadDraftAttachmentPayloads(
  supabase: SupabaseClient,
  draftId: number,
): Promise<LoadedDraftAttachment[]> {
  const rows = (await listDraftAttachments(supabase, draftId)) as AttachmentRow[];
  if (rows.length === 0) return [];

  const total = rows.reduce((sum, row) => sum + Number(row.byte_size), 0);
  if (total > MAX_DRAFT_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Draft attachments exceed the 20 MB total limit.");
  }

  const loaded: LoadedDraftAttachment[] = [];
  for (const row of rows) {
    const bucket = row.storage_bucket || EMAIL_ATTACHMENT_BUCKET;
    const { data, error } = await supabase.storage.from(bucket).download(row.storage_path);
    if (error || !data) {
      throw new Error(
        `Could not read attachment "${row.filename}": ${error?.message ?? "file missing"}`,
      );
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_DRAFT_ATTACHMENT_BYTES) {
      throw new Error(`Attachment "${row.filename}" is empty or larger than 10 MB.`);
    }
    loaded.push({
      filename: row.filename,
      contentType:
        contentTypeForFilename(row.filename) ||
        row.content_type ||
        "application/octet-stream",
      bytes,
      contentBase64: Buffer.from(bytes).toString("base64"),
    });
  }
  return loaded;
}

export function toProviderAttachments(
  files: LoadedDraftAttachment[],
): NonNullable<OutboundEmail["attachments"]> {
  return files.map((file) => ({
    content: file.contentBase64,
    filename: file.filename,
    type: file.contentType,
    disposition: "attachment" as const,
  }));
}

export function toGraphAttachments(files: LoadedDraftAttachment[]): GraphFileAttachment[] {
  return files.map((file) => ({
    name: file.filename,
    contentType: file.contentType,
    content: file.bytes,
  }));
}
