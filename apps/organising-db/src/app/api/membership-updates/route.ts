import { NextRequest, NextResponse } from "next/server";
import { requireMembershipUpdateAdmin } from "@/lib/membership-updates/require-admin";
import {
  finaliseBatchIfComplete,
  ingestMembershipUpdateFile,
  loadNotificationRecipients,
  NOTIFY_USER_IDS_SETTING,
} from "@/lib/membership-updates/ingest";
import { parseMembershipUpdateFilename } from "@/lib/membership-updates/kinds";
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

  const filed: { filename: string; kind: string; weekEnding: string; rowCount: number }[] = [];
  const skipped: { filename: string; reason: string }[] = [];
  const batchIds = new Set<number>();

  for (const file of uploads) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      skipped.push({ filename: file.name, reason: "Not an Excel file" });
      continue;
    }
    if (!parseMembershipUpdateFilename(file.name)) {
      skipped.push({
        filename: file.name,
        reason: "Name does not match OA - <Kind> Members - w-e DD-MM-YYYY.xlsx",
      });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ingestMembershipUpdateFile(admin, {
      filename: file.name,
      buffer,
      source: { source: "manual" },
    });
    if (!result) {
      skipped.push({ filename: file.name, reason: "Could not parse file name" });
      continue;
    }
    filed.push({
      filename: file.name,
      kind: result.kind,
      weekEnding: result.weekEnding,
      rowCount: result.rowCount,
    });
    batchIds.add(result.batchId);
  }

  const finalised = [];
  for (const batchId of batchIds) {
    finalised.push({ batchId, ...(await finaliseBatchIfComplete(admin, batchId)) });
  }

  return NextResponse.json({ filed, skipped, finalised });
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
