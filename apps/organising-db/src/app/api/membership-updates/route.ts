import { NextRequest, NextResponse } from "next/server";
import { requireMembershipUpdateAdmin } from "@/lib/membership-updates/require-admin";
import {
  fileMembershipUpdateGroup,
  loadNotificationRecipients,
  loadPendingReviewFiles,
  NOTIFY_USER_IDS_SETTING,
} from "@/lib/membership-updates/ingest";
import { membershipUpdateInbox } from "@/lib/membership-updates/inbox";

export const maxDuration = 120;

export async function GET() {
  const { error, status, admin } = await requireMembershipUpdateAdmin();
  if (error || !admin) return NextResponse.json({ error }, { status });

  const { data: batches, error: batchError } = await admin
    .from("membership_update_batches")
    .select("*")
    .order("week_ending", { ascending: false })
    .limit(50);
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });

  const ids = (batches ?? []).map((b: { batch_id: number }) => b.batch_id);
  const { data: files } = ids.length
    ? await admin.from("membership_update_files").select("*").in("batch_id", ids)
    : { data: [] };

  const { data: snapshots } = await admin
    .from("membership_movement_snapshots")
    .select("*")
    .eq("source", "weekly_update")
    .order("as_of", { ascending: false })
    .limit(50);

  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", NOTIFY_USER_IDS_SETTING)
    .maybeSingle();

  const notifyUserIds = String(setting?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { data: admins } = await admin
    .from("user_profiles")
    .select("user_id, display_name, role")
    .eq("role", "admin")
    .order("display_name");

  return NextResponse.json({
    batches: batches ?? [],
    files: files ?? [],
    reviewFiles: await loadPendingReviewFiles(admin),
    snapshots: snapshots ?? [],
    notifyUserIds,
    admins: admins ?? [],
    inboundAddress: membershipUpdateInbox(),
    effectiveRecipients: await loadNotificationRecipients(admin),
  });
}

export async function POST(request: NextRequest) {
  const { error, status, admin } = await requireMembershipUpdateAdmin();
  if (error || !admin) return NextResponse.json({ error }, { status });

  const form = await request.formData();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) {
    return NextResponse.json({ error: "Attach at least one .xlsx file" }, { status: 400 });
  }

  const skipped: { filename: string; reason: string }[] = [];
  const excel: { filename: string; buffer: Buffer }[] = [];
  for (const file of uploads) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      skipped.push({ filename: file.name, reason: "Not an Excel file" });
      continue;
    }
    excel.push({ filename: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
  }

  // One upload is one week's set, like one email.
  const result = await fileMembershipUpdateGroup(admin, excel, { source: "manual" }, new Date());
  skipped.push(...result.ignored, ...result.errors);
  const { filed, review, finalised } = result;

  return NextResponse.json({ filed, review, skipped, finalised });
}

export async function PATCH(request: NextRequest) {
  const { error, status, admin, user } = await requireMembershipUpdateAdmin();
  if (error || !admin || !user) return NextResponse.json({ error }, { status });

  const body = (await request.json()) as { notifyUserIds?: string[] };
  const ids = (body.notifyUserIds ?? []).filter((id) => typeof id === "string" && id.length > 0);
  const { error: upsertError } = await admin.from("app_settings").upsert({
    key: NOTIFY_USER_IDS_SETTING,
    value: ids.join(","),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  return NextResponse.json({ success: true, notifyUserIds: ids });
}
