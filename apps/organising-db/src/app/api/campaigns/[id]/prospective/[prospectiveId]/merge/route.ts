import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { prospectiveMergeSchema } from "@/lib/validation/prospective-review";
import { format } from "date-fns";

/**
 * Merge a pending prospective entry into an existing worker.
 *
 * Phase 5 — review queue. Auth: admin|user.
 *
 * Body: `{ existing_worker_id: number }`
 *
 * Behaviour:
 *   - Verify prospective is pending and belongs to this campaign.
 *   - Verify the target worker exists.
 *   - Best-effort merge: if the target row is missing email/phone, fill from
 *     prospective; always append the prospective notes to existing notes with
 *     a timestamped separator.
 *   - Mark prospective row `merged` with reviewer / timestamp / merged_worker_id.
 *
 * We do NOT auto-add the existing worker to the source task list — same
 * rationale as `promote/route.ts`: the leader hasn't necessarily said this
 * person belongs on their list permanently.
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
      { ok: false, error: "Body must be JSON: { existing_worker_id }" },
      { status: 400 }
    );
  }

  const parsed = prospectiveMergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { existing_worker_id } = parsed.data;

  const supabase = await createClient();
  const staff = await requireStaffUser(supabase);
  if (!staff) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Load prospective.
  const { data: prosp, error: pErr } = await supabase
    .from("campaign_prospective_workers")
    .select(
      "prospective_id, campaign_id, first_name, last_name, email, phone, notes, review_status"
    )
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

  // Verify target worker exists.
  const { data: existing, error: wErr } = await supabase
    .from("workers")
    .select("worker_id, email, phone, notes")
    .eq("worker_id", existing_worker_id)
    .single();

  if (wErr || !existing) {
    return NextResponse.json(
      { ok: false, error: "Target worker not found" },
      { status: 404 }
    );
  }

  // Best-effort merge of contact info + notes. phone_e164 is re-derived
  // by the workers_phone_e164_sync DB trigger.
  const patch: {
    email?: string;
    phone?: string;
    notes?: string;
    sms_consent_source?: string;
  } = {};

  const prospEmail =
    prosp.email && prosp.email.trim() !== "" ? prosp.email.trim() : null;
  const prospPhone =
    prosp.phone && prosp.phone.trim() !== "" ? prosp.phone.trim() : null;

  if (prospEmail && (!existing.email || existing.email.trim() === "")) {
    patch.email = prospEmail;
  }
  if (prospPhone && (!existing.phone || existing.phone.trim() === "")) {
    patch.phone = prospPhone;
    patch.sms_consent_source = "manual";
  }
  if (prosp.notes && prosp.notes.trim() !== "") {
    const stamp = format(new Date(), "d MMM yyyy");
    const sep = `\n\n[Merged from leader form on ${stamp}]\n`;
    patch.notes = `${existing.notes ?? ""}${sep}${prosp.notes.trim()}`.trim();
  }

  if (Object.keys(patch).length > 0) {
    const { error: upWErr } = await supabase
      .from("workers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("worker_id", existing_worker_id);
    if (upWErr) {
      // Non-fatal: still mark merged but surface a warning in the response.
      console.warn("merge: worker patch failed", upWErr);
    }
  }

  // Ensure the existing worker is in this campaign's membership (idempotent).
  const { error: memErr } = await supabase
    .from("campaign_worker_membership")
    .upsert(
      { campaign_id: campaignId, worker_id: existing_worker_id },
      { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
    );
  if (memErr) {
    console.warn("merge: membership upsert warning", memErr.message);
  }

  // Mark prospective merged.
  const { error: upPErr } = await supabase
    .from("campaign_prospective_workers")
    .update({
      review_status: "merged",
      reviewed_by: staff.user.id,
      reviewed_at: new Date().toISOString(),
      merged_worker_id: existing_worker_id,
    })
    .eq("prospective_id", prospId);

  if (upPErr) {
    return NextResponse.json(
      { ok: false, error: `Failed to mark merged: ${upPErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    merged_into: existing_worker_id,
  });
}
