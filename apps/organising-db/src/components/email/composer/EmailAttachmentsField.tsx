"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Library, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DOCUMENT_FILE_ACCEPT,
  EMAIL_ATTACHMENT_BUCKET,
  contentTypeForFilename,
  documentAttachmentError,
  draftAttachmentStoragePath,
  formatAttachmentBytes,
  attachmentQuotaError,
  type EmailDraftAttachment,
} from "@/lib/email/draft-attachments";

export function emailDraftAttachmentsKey(campaignId: number, draftId: number) {
  return ["email-draft-attachments", campaignId, draftId] as const;
}

export function useEmailDraftAttachments(campaignId: number, draftId: number | null) {
  return useQuery({
    queryKey: emailDraftAttachmentsKey(campaignId, draftId ?? 0),
    enabled: draftId != null && draftId > 0,
    queryFn: async () => {
      if (draftId == null) return [];
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/attachments`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not load attachments");
      }
      const body = (await res.json()) as { attachments: EmailDraftAttachment[] };
      return body.attachments ?? [];
    },
  });
}

interface LibraryDocument {
  document_id: number;
  title: string;
  file_path: string;
}

export function EmailAttachmentsField({
  campaignId,
  draftId,
}: {
  campaignId: number;
  draftId: number;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "library" | number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { data: attachments = [], isLoading } = useEmailDraftAttachments(
    campaignId,
    draftId,
  );

  const { data: libraryDocs = [], isLoading: libraryLoading } = useQuery({
    queryKey: ["campaign-documents", campaignId],
    enabled: libraryOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("document_id, title, file_path")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as LibraryDocument[]).filter((doc) =>
        contentTypeForFilename(doc.file_path.split("/").pop() ?? ""),
      );
    },
  });

  function refresh() {
    return queryClient.invalidateQueries({
      queryKey: emailDraftAttachmentsKey(campaignId, draftId),
    });
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const typeError = documentAttachmentError(file);
    if (typeError) {
      toast.error(typeError);
      return;
    }
    const quotaError = attachmentQuotaError(attachments, file.size);
    if (quotaError) {
      toast.error(quotaError);
      return;
    }

    const storagePath = draftAttachmentStoragePath(campaignId, draftId, file.name);
    setBusy("upload");
    try {
      const uploaded = await supabase.storage
        .from(EMAIL_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || contentTypeForFilename(file.name) || undefined,
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;

      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storage_path: storagePath,
            filename: file.name,
          }),
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        },
      );
      if (!res.ok) {
        await supabase.storage.from(EMAIL_ATTACHMENT_BUCKET).remove([storagePath]);
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save the attachment");
      }
      await refresh();
      toast.success(`Attached ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not attach that file");
    } finally {
      setBusy(null);
    }
  }

  async function attachDocument(documentId: number) {
    setBusy("library");
    try {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: documentId }),
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        },
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not attach that document");
      await refresh();
      setLibraryOpen(false);
      toast.success("Document attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not attach that document");
    } finally {
      setBusy(null);
    }
  }

  async function removeAttachment(attachment: EmailDraftAttachment) {
    setBusy(attachment.attachment_id);
    try {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/attachments/${attachment.attachment_id}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not remove the attachment");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the attachment");
    } finally {
      setBusy(null);
    }
  }

  async function openAttachment(attachment: EmailDraftAttachment) {
    const { data, error } = await supabase.storage
      .from(attachment.storage_bucket || EMAIL_ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.storage_path, 60, { download: attachment.filename });
    if (error || !data?.signedUrl) {
      toast.error("Could not open that attachment");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const disabled = busy !== null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={DOCUMENT_FILE_ACCEPT}
          className="hidden"
          onChange={onPickFile}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy === "upload" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          Attach PDF or document
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={disabled}
          onClick={() => setLibraryOpen(true)}
        >
          <Library className="h-3.5 w-3.5" />
          From campaign library
        </Button>
        {isLoading && (
          <span className="text-xs text-muted-foreground">Loading attachments…</span>
        )}
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <li
              key={attachment.attachment_id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="truncate underline-offset-2 hover:underline"
                onClick={() => void openAttachment(attachment)}
              >
                {attachment.filename}
              </button>
              <span className="shrink-0 text-muted-foreground">
                {formatAttachmentBytes(attachment.byte_size)}
              </span>
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-accent"
                aria-label={`Remove ${attachment.filename}`}
                disabled={disabled}
                onClick={() => void removeAttachment(attachment)}
              >
                {busy === attachment.attachment_id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        PDF, Word, Excel, PowerPoint, and similar documents. Up to 5 files, 10 MB
        each. Included on Outlook and platform sends. Action Network cannot take
        file attachments.
      </p>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attach a campaign document</DialogTitle>
            <DialogDescription>
              Only PDF and document files from this campaign&apos;s library are listed.
            </DialogDescription>
          </DialogHeader>
          {libraryLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents…
            </div>
          ) : libraryDocs.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No PDF or document files in this campaign library yet.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-auto">
              {libraryDocs.map((doc) => {
                const filename = doc.file_path.split("/").pop() ?? doc.title;
                return (
                  <li key={doc.document_id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => void attachDocument(doc.document_id)}
                    >
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{doc.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {filename}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
