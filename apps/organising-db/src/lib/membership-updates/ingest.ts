/**
 * Filing a received weekly membership spreadsheet, and closing out a batch
 * once all four have arrived. Server-only: takes the service-role client.
 *
 * Flow per set of files (one email or upload, `fileMembershipUpdateGroup`):
 * classify each file (classify.ts) → files it cannot settle are held in
 * membership_update_review_files for an admin → the rest upsert the week's
 * batch, store the bytes in the membership-updates bucket and upsert the
 * file row with its row count. Then `finaliseBatchIfComplete`: when all four kinds
 * are present the batch becomes "ready", the dated movement snapshot is
 * written and the chosen admins get a notification row each.
 */

import { randomUUID } from "node:crypto";
import {
  MEMBERSHIP_UPDATE_KINDS,
  computeNetMovement,
  membershipUpdateStoragePath,
  type MembershipUpdateKind,
} from "./kinds";
import {
  classifyWeeklyFile,
  resolveWeeklyFileGroup,
  type WeeklyFileClassification,
} from "./classify";
import { countWeeklyUpdateRows } from "./parse-files";
import type { MembershipUpdateReviewFile } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const MEMBERSHIP_UPDATES_BUCKET = "membership-updates";
/** Storage prefix for files held for review (batch paths start with a date). */
const REVIEW_STORAGE_PREFIX = "review";
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const NOTIFY_USER_IDS_SETTING = "membership_update_notify_user_ids";

export interface IngestSource {
  source: "email" | "manual";
  emailId?: string | null;
  from?: string | null;
  subject?: string | null;
  resendAttachmentId?: string | null;
}

export interface IngestResult {
  batchId: number;
  kind: MembershipUpdateKind;
  weekEnding: string;
  rowCount: number;
  replaced: boolean;
}

/**
 * File one spreadsheet into its week's batch as the given kind. The caller
 * has already worked out the kind and week (classify.ts, or an admin's
 * review); `classification` records how.
 */
export async function ingestMembershipUpdateFile(
  admin: Supa,
  input: {
    filename: string;
    buffer: Buffer;
    source: IngestSource;
    kind: MembershipUpdateKind;
    weekEnding: string;
    classification?: Record<string, unknown> | null;
  }
): Promise<IngestResult> {
  const { kind, weekEnding } = input;

  const rowCount = countWeeklyUpdateRows(kind, input.buffer);

  const { data: existingBatch, error: batchReadError } = await admin
    .from("membership_update_batches")
    .select("batch_id, status")
    .eq("week_ending", weekEnding)
    .maybeSingle();
  if (batchReadError) throw new Error(batchReadError.message);

  let batchId: number;
  if (existingBatch) {
    batchId = existingBatch.batch_id;
    // A re-send after import does not reopen the batch; the file is still
    // kept so the record matches what was received.
    const patch: Record<string, unknown> = {
      source_email_id: input.source.emailId ?? undefined,
      source_from: input.source.from ?? undefined,
      source_subject: input.source.subject ?? undefined,
    };
    if (existingBatch.status === "dismissed") patch.status = "receiving";
    const { error } = await admin
      .from("membership_update_batches")
      .update(stripUndefined(patch))
      .eq("batch_id", batchId);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await admin
      .from("membership_update_batches")
      .insert({
        week_ending: weekEnding,
        status: "receiving",
        source: input.source.source,
        source_email_id: input.source.emailId ?? null,
        source_from: input.source.from ?? null,
        source_subject: input.source.subject ?? null,
      })
      .select("batch_id")
      .single();
    if (error) throw new Error(error.message);
    batchId = inserted.batch_id;
  }

  const storagePath = membershipUpdateStoragePath(weekEnding, kind);
  const { error: uploadError } = await admin.storage
    .from(MEMBERSHIP_UPDATES_BUCKET)
    .upload(storagePath, input.buffer, {
      upsert: true,
      contentType: XLSX_CONTENT_TYPE,
    });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: existingFile } = await admin
    .from("membership_update_files")
    .select("file_id")
    .eq("batch_id", batchId)
    .eq("kind", kind)
    .maybeSingle();

  const { error: fileError } = await admin.from("membership_update_files").upsert(
    {
      batch_id: batchId,
      kind,
      filename: input.filename,
      storage_bucket: MEMBERSHIP_UPDATES_BUCKET,
      storage_path: storagePath,
      byte_size: input.buffer.byteLength,
      row_count: rowCount,
      resend_attachment_id: input.source.resendAttachmentId ?? null,
      classification: input.classification ?? null,
      received_at: new Date().toISOString(),
    },
    { onConflict: "batch_id,kind" }
  );
  if (fileError) throw new Error(fileError.message);

  return { batchId, kind, weekEnding, rowCount, replaced: Boolean(existingFile) };
}

function classificationRecord(c: WeeklyFileClassification): Record<string, unknown> {
  return { notes: c.notes, issues: c.issues, signals: c.signals };
}

/**
 * Keep a file whose kind or week could not be settled, for an admin to
 * confirm on the Weekly Updates tab. A re-delivered email attachment that is
 * already queued (or was already resolved) is not queued again.
 */
export async function holdMembershipUpdateFileForReview(
  admin: Supa,
  input: { filename: string; buffer: Buffer; source: IngestSource; classification: WeeklyFileClassification }
): Promise<{ reviewId: number; duplicate: boolean }> {
  const attachmentId = input.source.resendAttachmentId ?? null;
  if (attachmentId) {
    const { data: existing } = await admin
      .from("membership_update_review_files")
      .select("review_id")
      .eq("resend_attachment_id", attachmentId)
      .maybeSingle();
    if (existing) return { reviewId: existing.review_id, duplicate: true };
  }

  const storagePath = `${REVIEW_STORAGE_PREFIX}/${randomUUID()}.xlsx`;
  const { error: uploadError } = await admin.storage
    .from(MEMBERSHIP_UPDATES_BUCKET)
    .upload(storagePath, input.buffer, { contentType: XLSX_CONTENT_TYPE });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const c = input.classification;
  const { data, error } = await admin
    .from("membership_update_review_files")
    .insert({
      filename: input.filename,
      storage_bucket: MEMBERSHIP_UPDATES_BUCKET,
      storage_path: storagePath,
      byte_size: input.buffer.byteLength,
      row_count: c.signals.rowCount,
      source: input.source.source,
      source_email_id: input.source.emailId ?? null,
      source_from: input.source.from ?? null,
      source_subject: input.source.subject ?? null,
      resend_attachment_id: attachmentId,
      suggested_kind: c.kind,
      suggested_week_ending: c.weekEnding,
      issues: c.issues,
      classification: classificationRecord(c),
    })
    .select("review_id")
    .single();
  if (error) throw new Error(error.message);
  return { reviewId: data.review_id, duplicate: false };
}

export interface GroupUpload {
  filename: string;
  buffer: Buffer;
  resendAttachmentId?: string | null;
}

export interface GroupFilingResult {
  filed: { filename: string; kind: MembershipUpdateKind; weekEnding: string; rowCount: number; replaced: boolean }[];
  review: { filename: string; reviewId: number; issues: string[] }[];
  ignored: { filename: string; reason: string }[];
  errors: { filename: string; reason: string }[];
  finalised: ({ batchId: number } & FinaliseResult)[];
}

/**
 * File a set of spreadsheets that arrived together (one email, one upload).
 * Each is classified, the set shares a week, and each file is then filed,
 * held for review, or ignored when it is not a weekly file. Batches that
 * received a file are finalised.
 */
export async function fileMembershipUpdateGroup(
  admin: Supa,
  uploads: GroupUpload[],
  source: IngestSource,
  receivedAt: Date
): Promise<GroupFilingResult> {
  const result: GroupFilingResult = { filed: [], review: [], ignored: [], errors: [], finalised: [] };
  const classified = resolveWeeklyFileGroup(
    uploads.map((u) => classifyWeeklyFile(u.filename, u.buffer, receivedAt))
  );

  const batchIds = new Set<number>();
  for (let i = 0; i < uploads.length; i++) {
    const upload = uploads[i];
    const c = classified[i];
    const fileSource = { ...source, resendAttachmentId: upload.resendAttachmentId ?? null };
    try {
      if (!c.isWeeklyFile) {
        result.ignored.push({ filename: upload.filename, reason: "Not one of the weekly membership files" });
      } else if (c.needsReview || !c.kind || !c.weekEnding) {
        const held = await holdMembershipUpdateFileForReview(admin, {
          filename: upload.filename,
          buffer: upload.buffer,
          source: fileSource,
          classification: c,
        });
        result.review.push({ filename: upload.filename, reviewId: held.reviewId, issues: c.issues });
      } else {
        const filed = await ingestMembershipUpdateFile(admin, {
          filename: upload.filename,
          buffer: upload.buffer,
          source: fileSource,
          kind: c.kind,
          weekEnding: c.weekEnding,
          classification: classificationRecord(c),
        });
        batchIds.add(filed.batchId);
        result.filed.push({
          filename: upload.filename,
          kind: filed.kind,
          weekEnding: filed.weekEnding,
          rowCount: filed.rowCount,
          replaced: filed.replaced,
        });
      }
    } catch (err) {
      result.errors.push({ filename: upload.filename, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const batchId of batchIds) {
    try {
      result.finalised.push({ batchId, ...(await finaliseBatchIfComplete(admin, batchId)) });
    } catch (err) {
      result.errors.push({ filename: `batch ${batchId}`, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/** Pending review files — what the Weekly Updates tab and login banner show. */
export async function loadPendingReviewFiles(admin: Supa): Promise<MembershipUpdateReviewFile[]> {
  const { data, error } = await admin
    .from("membership_update_review_files")
    .select(
      "review_id, filename, byte_size, row_count, source, source_from, source_subject, suggested_kind, suggested_week_ending, issues, classification, received_at"
    )
    .eq("status", "pending")
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as MembershipUpdateReviewFile[];
}

/**
 * An admin's decision on a held file: file it as the chosen kind and week
 * (then finalise that batch), or discard it. The held copy is removed from
 * storage either way; a filed file lives on at its batch path.
 */
export async function resolveReviewFile(
  admin: Supa,
  input:
    | { reviewId: number; userId: string; action: "file"; kind: MembershipUpdateKind; weekEnding: string }
    | { reviewId: number; userId: string; action: "discard" }
): Promise<{ status: "filed" | "discarded"; filed?: IngestResult; finalised?: FinaliseResult }> {
  const { data: review, error } = await admin
    .from("membership_update_review_files")
    .select("*")
    .eq("review_id", input.reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!review) throw new ReviewFileError("Not found", 404);
  if (review.status !== "pending") throw new ReviewFileError(`Already ${review.status}`, 409);

  // Claim the row first so a double click cannot file it twice.
  const resolvedAt = new Date().toISOString();
  const status = input.action === "discard" ? "discarded" : "filed";
  const { data: claimed, error: claimError } = await admin
    .from("membership_update_review_files")
    .update({ status, resolved_at: resolvedAt, resolved_by: input.userId })
    .eq("review_id", input.reviewId)
    .eq("status", "pending")
    .select("review_id");
  if (claimError) throw new Error(claimError.message);
  if (!claimed || claimed.length === 0) throw new ReviewFileError("Already resolved", 409);

  if (input.action === "discard") {
    await admin.storage.from(review.storage_bucket).remove([review.storage_path]);
    return { status: "discarded" };
  }

  let filed: IngestResult;
  try {
    const buffer = await downloadMembershipUpdateFile(admin, review.storage_path);
    filed = await ingestMembershipUpdateFile(admin, {
    filename: review.filename,
    buffer,
    source: {
      source: review.source,
      emailId: review.source_email_id,
      from: review.source_from,
      subject: review.source_subject,
      resendAttachmentId: review.resend_attachment_id,
    },
    kind: input.kind,
    weekEnding: input.weekEnding,
    classification: {
      ...(review.classification ?? {}),
      reviewed: {
        by: input.userId,
        at: resolvedAt,
        suggestedKind: review.suggested_kind,
        suggestedWeekEnding: review.suggested_week_ending,
      },
    },
    });
  } catch (err) {
    // Put it back in the queue so it can be retried.
    await admin
      .from("membership_update_review_files")
      .update({ status: "pending", resolved_at: null, resolved_by: null })
      .eq("review_id", input.reviewId);
    throw err;
  }
  const { error: updError } = await admin
    .from("membership_update_review_files")
    .update({ filed_batch_id: filed.batchId })
    .eq("review_id", input.reviewId);
  if (updError) throw new Error(updError.message);
  await admin.storage.from(review.storage_bucket).remove([review.storage_path]);
  const finalised = await finaliseBatchIfComplete(admin, filed.batchId);
  return { status: "filed", filed, finalised };
}

export class ReviewFileError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export interface FinaliseResult {
  complete: boolean;
  status: string;
  countsByKind: Record<MembershipUpdateKind, number>;
  netMovement: number;
  notified: number;
}

/**
 * Recipients: the admins chosen in Administration → Weekly Updates, or every
 * admin when none are chosen.
 */
export async function loadNotificationRecipients(admin: Supa): Promise<string[]> {
  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", NOTIFY_USER_IDS_SETTING)
    .maybeSingle();
  const configured = String(setting?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length > 0) {
    // Only current admins; a demoted user drops out automatically.
    const { data: stillAdmins } = await admin
      .from("user_profiles")
      .select("user_id")
      .in("user_id", configured)
      .eq("role", "admin");
    return (stillAdmins ?? []).map((r: { user_id: string }) => r.user_id);
  }
  const { data: admins } = await admin.from("user_profiles").select("user_id").eq("role", "admin");
  return (admins ?? []).map((r: { user_id: string }) => r.user_id);
}

/**
 * When all four files are on the batch: mark ready, write / refresh the
 * movement snapshot and create notifications. Safe to call after every file;
 * it is idempotent and only notifies once per recipient per batch.
 */
export async function finaliseBatchIfComplete(admin: Supa, batchId: number): Promise<FinaliseResult> {
  const { data: batch, error: batchError } = await admin
    .from("membership_update_batches")
    .select("batch_id, week_ending, status, source")
    .eq("batch_id", batchId)
    .single();
  if (batchError) throw new Error(batchError.message);

  const { data: files, error: filesError } = await admin
    .from("membership_update_files")
    .select("kind, row_count")
    .eq("batch_id", batchId);
  if (filesError) throw new Error(filesError.message);

  const countsByKind: Record<MembershipUpdateKind, number> = {
    new: 0,
    recommenced: 0,
    resigned: 0,
    unfinancial: 0,
  };
  const present = new Set<MembershipUpdateKind>();
  for (const f of files ?? []) {
    const kind = f.kind as MembershipUpdateKind;
    present.add(kind);
    countsByKind[kind] = f.row_count ?? 0;
  }
  const complete = MEMBERSHIP_UPDATE_KINDS.every((k) => present.has(k));
  const netMovement = computeNetMovement(countsByKind);

  if (!complete) {
    return { complete: false, status: batch.status, countsByKind, netMovement, notified: 0 };
  }

  let status: string = batch.status;
  if (batch.status === "receiving") {
    const { error } = await admin
      .from("membership_update_batches")
      .update({ status: "ready", ready_at: new Date().toISOString() })
      .eq("batch_id", batchId);
    if (error) throw new Error(error.message);
    status = "ready";
  }

  // The snapshot follows the files until the batch is imported.
  if (status !== "imported") {
    const { error: snapError } = await admin.from("membership_movement_snapshots").upsert(
      {
        as_of: batch.week_ending,
        source: "weekly_update",
        batch_id: batchId,
        new_members: countsByKind.new,
        recommenced_members: countsByKind.recommenced,
        resigned_members: countsByKind.resigned,
        unfinancial_members: countsByKind.unfinancial,
        tags: ["weekly", batch.source === "manual" ? "manual-upload" : "emailed"],
      },
      { onConflict: "as_of,source" }
    );
    if (snapError) throw new Error(snapError.message);
  }

  let notified = 0;
  if (status === "ready") {
    const recipients = await loadNotificationRecipients(admin);
    if (recipients.length > 0) {
      const { error: notifyError, data } = await admin
        .from("membership_update_notifications")
        .upsert(
          recipients.map((user_id) => ({ batch_id: batchId, user_id })),
          { onConflict: "batch_id,user_id", ignoreDuplicates: true }
        )
        .select("notification_id");
      if (notifyError) throw new Error(notifyError.message);
      notified = (data ?? []).length;
    }
  }

  return { complete: true, status, countsByKind, netMovement, notified };
}

/** Download a stored weekly file. */
export async function downloadMembershipUpdateFile(
  admin: Supa,
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await admin.storage.from(MEMBERSHIP_UPDATES_BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Could not read ${storagePath}: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}
