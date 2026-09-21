import { describe, expect, it } from "vitest";
import {
  attachmentQuotaError,
  contentTypeForFilename,
  documentAttachmentError,
  draftAttachmentStoragePath,
  isDraftAttachmentPath,
  MAX_DRAFT_ATTACHMENT_BYTES,
  safeAttachmentFilename,
} from "@/lib/email/draft-attachments";
import { graphUploadRanges } from "@/lib/integrations/microsoft-graph";

describe("document attachments", () => {
  it("accepts PDFs and office documents and rejects other files", () => {
    expect(documentAttachmentError({ name: "flyer.pdf", size: 1200 })).toBeNull();
    expect(documentAttachmentError({ name: "brief.DOCX", size: 1200 })).toBeNull();
    expect(contentTypeForFilename("notes.txt")).toBe("text/plain");
    expect(documentAttachmentError({ name: "photo.png", size: 1200 })).toMatch(/PDF or document/);
    expect(documentAttachmentError({ name: "payload.exe", size: 1200 })).toMatch(/PDF or document/);
    expect(documentAttachmentError({ name: "empty.pdf", size: 0 })).toMatch(/empty/);
    expect(
      documentAttachmentError({
        name: "huge.pdf",
        size: MAX_DRAFT_ATTACHMENT_BYTES + 1,
      }),
    ).toMatch(/10 MB/);
  });

  it("sanitises filenames and only accepts paths for the owning draft", () => {
    expect(safeAttachmentFilename("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(safeAttachmentFilename("May Day flyer (final).pdf")).toBe(
      "May_Day_flyer_final_.pdf",
    );
    const path = draftAttachmentStoragePath(4, 9, "brief.pdf", "abc");
    expect(path).toBe("drafts/4/9/abc_brief.pdf");
    expect(isDraftAttachmentPath(4, 9, path)).toBe(true);
    expect(isDraftAttachmentPath(4, 9, "drafts/4/8/abc_brief.pdf")).toBe(false);
    expect(isDraftAttachmentPath(4, 9, "drafts/4/9/../8/secret.pdf")).toBe(false);
  });

  it("enforces the count and total size quota", () => {
    expect(attachmentQuotaError([{ byte_size: 100 }], 50)).toBeNull();
    expect(
      attachmentQuotaError(
        Array.from({ length: 5 }, () => ({ byte_size: 10 })),
        10,
      ),
    ).toMatch(/maximum of 5/);
    expect(attachmentQuotaError([{ byte_size: 15 * 1024 * 1024 }], 6 * 1024 * 1024)).toMatch(
      /20 MB/,
    );
  });
});

describe("graphUploadRanges", () => {
  it("splits a file into 320 KiB multiples with a short last chunk", () => {
    const chunk = 320 * 1024;
    const ranges = graphUploadRanges(chunk * 2 + 10, chunk);
    expect(ranges).toEqual([
      { start: 0, end: chunk - 1 },
      { start: chunk, end: chunk * 2 - 1 },
      { start: chunk * 2, end: chunk * 2 + 9 },
    ]);
  });
});
