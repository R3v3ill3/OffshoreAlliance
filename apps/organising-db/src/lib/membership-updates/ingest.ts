/**
 * Filing a received weekly membership spreadsheet, and closing out a batch
 * once all four have arrived. Server-only: takes the service-role client.
 *
 * Flow per attachment: parse the file name → upsert the week's batch →
 * store the bytes in the membership-updates bucket → upsert the file row
 * with its row count. Then `finaliseBatchIfComplete`: when all four kinds
 * are present the batch becomes "ready", the dated movement snapshot is
 * written and the chosen admins get a notification row each.
 */

import {
  MEMBERSHIP_UPDATE_KINDS,
  computeNetMovement,
  membershipUpdateStoragePath,
  parseMembershipUpdateFilename,
  type MembershipUpdateKind,
} from "./kinds";
import { countWeeklyUpdateRows } from "./parse-files";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const MEMBERSHIP_UPDATES_BUCKET = "membership-updates";
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
 * File one spreadsheet. Returns null (and does nothing) when the file name is
 * not one of the four weekly files, so callers can pass every attachment.
 */
export async function ingestMembershipUpdateFile(
  admin: Supa,
  input: { filename: string; buffer: Buffer; source: IngestSource }
): Promise<IngestResult | null> {
  const parsed = parseMembershipUpdateFilename(input.filename);
  if (!parsed) return null;
  const { kind, weekEnding } = parsed;

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
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
      received_at: new Date().toISOString(),
    },
    { onConflict: "batch_id,kind" }
  );
  if (fileError) throw new Error(fileError.message);

  return { batchId, kind, weekEnding, rowCount, replaced: Boolean(existingFile) };
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
