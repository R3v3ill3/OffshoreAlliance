import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { prospectiveRejectSchema } from "@/lib/validation/prospective-review";

/**
 * Reject a pending prospective entry. Phase 5 — review queue.
 * Auth: admin|user. Body: `{ reason: string }`.
 *
 * The reason is stored on `review_notes` for the audit trail; reviewer +
 * timestamp + status are also recorded.
 */
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; prospectiveId: string }> }
) {
  const { id, prospectiveId } = await params;
  const campaignId = Number(id);
  const prospId = Number(prospectiveId);

  if (!Number.isFinite(campaignId) || !Number.isFinite(prospId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid campaign or prospective id" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body must be JSON: { reason }" },
      { status: 400 }
    );
  }

  const parsed = prospectiveRejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const staff = await requireStaffUser(supabase);
  if (!staff) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data: prosp, error: pErr } = await supabase
    .from("campaign_prospective_workers")
    .select("prospective_id, campaign_id, review_status")
    .eq("prospective_id", prospId)
    .single();

  if (pErr || !prosp) {
    return NextResponse.json(
      { ok: false, error: "Prospective entry not found" },
      { status: 404 }
    );
  }
  if (prosp.campaign_id !== campaignId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Prospective entry does not belong to this campaign",
      },
      { status: 403 }
    );
  }
  if (prosp.review_status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `Already reviewed (status: ${prosp.review_status})` },
      { status: 409 }
    );
  }

  const { error: upErr } = await supabase
    .from("campaign_prospective_workers")
    .update({
      review_status: "rejected",
      reviewed_by: staff.user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: parsed.data.reason,
    })
    .eq("prospective_id", prospId);

  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `Failed to mark rejected: ${upErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
