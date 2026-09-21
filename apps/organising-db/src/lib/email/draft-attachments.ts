/**
 * Rules for files attached to an outbound campaign email draft.
 *
 * Kept free of server-only imports so the composer can share the same
 * extension and size checks as the API.
 */

export const EMAIL_ATTACHMENT_BUCKET = "email-attachments";

export const MAX_DRAFT_ATTACHMENTS = 5;
export const MAX_DRAFT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DRAFT_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

/** Microsoft Graph's simple fileAttachment payload is limited to 3 MB. */
export const GRAPH_SIMPLE_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
};

export const ALLOWED_DOCUMENT_EXTENSIONS = Object.keys(EXTENSION_CONTENT_TYPES);

export const DOCUMENT_FILE_ACCEPT = ALLOWED_DOCUMENT_EXTENSIONS.map(
  (ext) => `.${ext}`,
).join(",");

export interface EmailDraftAttachment {
  attachment_id: number;
  filename: string;
  content_type: string | null;
  byte_size: number;
  storage_bucket: string;
  storage_path: string;
  source_document_id: number | null;
  created_at: string;
}

export function fileExtension(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function contentTypeForFilename(name: string): string | null {
  const ext = fileExtension(name);
  return EXTENSION_CONTENT_TYPES[ext] ?? null;
}

export function safeAttachmentFilename(name: string): string {
  const base = (name.trim().split(/[\\/]/).pop() ?? "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "");
  const trimmed = base.slice(0, 180);
  return trimmed || "document";
}

export function documentAttachmentError(file: {
  name: string;
  size: number;
}): string | null {
  if (!contentTypeForFilename(file.name)) {
    return "Attach a PDF or document (Word, Excel, PowerPoint, OpenDocument, RTF, CSV, or plain text).";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "That file is empty.";
  }
  if (file.size > MAX_DRAFT_ATTACHMENT_BYTES) {
    return "Each attachment must be 10 MB or smaller.";
  }
  return null;
}

export function attachmentQuotaError(
  existing: Array<{ byte_size: number }>,
  nextSize: number,
): string | null {
  if (existing.length >= MAX_DRAFT_ATTACHMENTS) {
    return `A maximum of ${MAX_DRAFT_ATTACHMENTS} attachments is allowed.`;
  }
  const total = existing.reduce((sum, row) => sum + row.byte_size, 0) + nextSize;
  if (total > MAX_DRAFT_ATTACHMENT_TOTAL_BYTES) {
    return "Attachments must be 20 MB or smaller in total.";
  }
  return null;
}

export function draftAttachmentStoragePath(
  campaignId: number,
  draftId: number,
  filename: string,
  id: string = crypto.randomUUID(),
): string {
  return `drafts/${campaignId}/${draftId}/${id}_${safeAttachmentFilename(filename)}`;
}

export function isDraftAttachmentPath(
  campaignId: number,
  draftId: number,
  storagePath: string,
): boolean {
  if (!Number.isInteger(campaignId) || !Number.isInteger(draftId)) return false;
  if (campaignId <= 0 || draftId <= 0) return false;
  const prefix = `drafts/${campaignId}/${draftId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  if (storagePath.includes("..") || storagePath.includes("\\")) return false;
  const rest = storagePath.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

export function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
