import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "admin") return NextResponse.json({ notifications: [] });

  const { data, error: qError } = await supabase
    .from("membership_update_notifications")
    .select(
      "notification_id, batch_id, created_at, seen_at, dismissed_at, batch:membership_update_batches(batch_id, week_ending, status, ready_at)"
    )
    .eq("user_id", user.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false });
  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  const notifications = data ?? [];
  const batchIds = notifications
    .map((n) => n.batch_id)
    .filter((id): id is number => typeof id === "number");

  const admin = createAdminClient();
  const { data: files } = batchIds.length
    ? await admin.from("membership_update_files").select("batch_id, kind, row_count, filename").in("batch_id", batchIds)
    : { data: [] };
  const { data: snapshots } = batchIds.length
    ? await admin
        .from("membership_movement_snapshots")
        .select("*")
        .in("batch_id", batchIds)
    : { data: [] };

  const unseen = notifications.filter((n) => !n.seen_at).map((n) => n.notification_id);
  if (unseen.length > 0) {
    await admin
      .from("membership_update_notifications")
      .update({ seen_at: new Date().toISOString() })
      .in("notification_id", unseen);
  }

  const { count: reviewCount } = await admin
    .from("membership_update_review_files")
    .select("review_id", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({
    notifications,
    files: files ?? [],
    snapshots: snapshots ?? [],
    reviewCount: reviewCount ?? 0,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { notificationId?: number; batchId?: number };
  const admin = createAdminClient();
  let query = admin
    .from("membership_update_notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("dismissed_at", null);
  if (body.notificationId) query = query.eq("notification_id", body.notificationId);
  else if (body.batchId) query = query.eq("batch_id", body.batchId);
  else return NextResponse.json({ error: "notificationId or batchId is required" }, { status: 400 });

  const { error: updError } = await query;
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
