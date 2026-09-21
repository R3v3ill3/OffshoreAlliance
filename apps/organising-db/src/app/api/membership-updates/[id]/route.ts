import { NextRequest, NextResponse } from "next/server";
import { requireMembershipUpdateAdmin } from "@/lib/membership-updates/require-admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, status, admin } = await requireMembershipUpdateAdmin();
  if (error || !admin) return NextResponse.json({ error }, { status });

  const batchId = Number((await params).id);
  if (!Number.isFinite(batchId)) {
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const { data: batch, error: batchError } = await admin
    .from("membership_update_batches")
    .select("*")
    .eq("batch_id", batchId)
    .maybeSingle();
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: files } = await admin
    .from("membership_update_files")
    .select("*")
    .eq("batch_id", batchId);
  const { data: snapshot } = await admin
    .from("membership_movement_snapshots")
    .select("*")
    .eq("batch_id", batchId)
    .maybeSingle();

  return NextResponse.json({ batch, files: files ?? [], snapshot });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, status, admin, user } = await requireMembershipUpdateAdmin();
  if (error || !admin || !user) return NextResponse.json({ error }, { status });

  const batchId = Number((await params).id);
  const body = (await request.json()) as {
    action?: "dismiss" | "complete";
    importSummary?: Record<string, unknown>;
  };

  if (body.action === "dismiss") {
    const { error: updError } = await admin
      .from("membership_update_batches")
      .update({
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
        dismissed_by: user.id,
      })
      .eq("batch_id", batchId);
    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });
    await admin
      .from("membership_update_notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("batch_id", batchId)
      .is("dismissed_at", null);
    return NextResponse.json({ success: true, status: "dismissed" });
  }

  if (body.action === "complete") {
    const { error: updError } = await admin
      .from("membership_update_batches")
      .update({
        status: "imported",
        imported_at: new Date().toISOString(),
        imported_by: user.id,
        import_summary: body.importSummary ?? null,
      })
      .eq("batch_id", batchId);
    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });
    await admin
      .from("membership_update_notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("batch_id", batchId)
      .is("dismissed_at", null);
    return NextResponse.json({ success: true, status: "imported" });
  }

  return NextResponse.json({ error: "action must be dismiss or complete" }, { status: 400 });
}
