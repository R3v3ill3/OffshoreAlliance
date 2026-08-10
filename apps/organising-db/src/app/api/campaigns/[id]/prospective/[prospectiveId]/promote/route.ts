import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { toE164 } from "@/lib/phone/normalise-phone";

/**
 * Promote a pending leader-form submission into a real `workers` row +
 * `campaign_worker_membership` for this campaign.
 *
 * Phase 5 — review queue. Auth: admin|user (staff). The leader form added the
 * row via the public token endpoint with `review_status='pending'` and
 * `source_token_id` / `source_leader_worker_id` set so this route can show
 * provenance.
 *
 * Side effects:
 *   1. INSERT INTO workers (first/last/email/phone/notes; is_active=true).
 *   2. INSERT INTO campaign_worker_membership (campaign_id, worker_id). Union
 *      role lives globally on `workers.member_role_type_id` and is left
 *      untouched here — promoting someone out of the review queue is not the
 *      same as them taking a task. Role only changes when a task list is
 *      activated with this worker as its `leader_worker_id` (the
 *      `fn_auto_rate_promote_task_list_leader` trigger handles that for the
 *      leader only) or via an explicit user action. We deliberately do NOT
 *      insert into `campaign_task_list_items` here — being a list assignee
 *      no longer triggers role/rating side effects, but conceptually a
 *      prospective promotion is not a task assignment.
 *   3. If the prospective row carried a rating AND the source task list has an
 *      activity, write it via `record_assessment_event` with
 *      `source='leader_form'` and patch `assessment_type_override`.
 *      If no activity is known, the rating is dropped silently.
 *   4. Mark prospective row approved with reviewer / timestamp / merged_worker_id.
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

  const supabase = await createClient();
  const staff = await requireStaffUser(supabase);
  if (!staff) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 1. Load prospective row (verify campaign + status).
  const { data: prosp, error: pErr } = await supabase
    .from("campaign_prospective_workers")
    .select(
      "prospective_id, campaign_id, task_list_id, first_name, last_name, email, phone, notes, rating, review_status"
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
      { ok: false, error: "Prospective entry does not belong to this campaign" },
      { status: 403 }
    );
  }
  if (prosp.review_status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `Already reviewed (status: ${prosp.review_status})` },
      { status: 409 }
    );
  }

  // 2. Insert workers row.
  const { data: newWorker, error: wErr } = await supabase
    .from("workers")
    .insert({
      first_name: prosp.first_name,
      last_name: prosp.last_name,
      email: prosp.email && prosp.email.trim() !== "" ? prosp.email : null,
      phone: prosp.phone && prosp.phone.trim() !== "" ? prosp.phone : null,
      phone_e164: toE164(prosp.phone),
      sms_consent_source:
        prosp.phone && prosp.phone.trim() !== "" ? "manual" : null,
      notes: prosp.notes ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("worker_id")
    .single();

  if (wErr || !newWorker) {
    return NextResponse.json(
      { ok: false, error: wErr?.message ?? "Failed to create worker" },
      { status: 500 }
    );
  }
  const workerId = newWorker.worker_id as number;

  // 3. Membership upsert. Role state lives globally on
  //    workers.member_role_type_id and is intentionally untouched here.
  const { error: mErr } = await supabase
    .from("campaign_worker_membership")
    .upsert(
      { campaign_id: campaignId, worker_id: workerId },
      { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
    );
  if (mErr) {
    return NextResponse.json(
      { ok: false, error: `Membership write failed: ${mErr.message}` },
      { status: 500 }
    );
  }

  // 4. Optional rating — only if prospective.rating present AND we can find a
  //    task list activity to attach it to.
  let ratingRecorded = false;
  if (prosp.rating != null && prosp.task_list_id != null) {
    const { data: tl } = await supabase
      .from("campaign_task_lists")
      .select("activity_id")
      .eq("task_list_id", prosp.task_list_id)
      .maybeSingle();

    if (tl?.activity_id != null) {
      const { error: rpcErr } = await supabase.rpc("record_assessment_event", {
        p_activity_id: tl.activity_id,
        p_worker_id: workerId,
        p_rating: prosp.rating,
        p_binary_value: null,
        p_rating_phase: "actual",
        p_event_id: null,
        p_source: "leader_form",
        p_notes: "Promoted from leader-form prospective entry",
        p_actor_id: staff.user.id,
      });

      if (!rpcErr) {
        // Best-effort: tag the override so reporting reflects activist provenance.
        await supabase
          .from("campaign_activity_ratings")
          .update({ assessment_type_override: "activist_assessed" })
          .eq("activity_id", tl.activity_id)
          .eq("worker_id", workerId)
          .eq("rating_phase", "actual")
          .is("event_id", null);
        ratingRecorded = true;
      } else {
        // Don't fail the promotion just because the rating side-effect failed —
        // staff can re-rate manually if needed.
        console.warn(
          "promote: record_assessment_event failed, continuing",
          rpcErr.message
        );
      }
    }
  }

  // 5. Mark prospective approved.
  const { error: upErr } = await supabase
    .from("campaign_prospective_workers")
    .update({
      review_status: "approved",
      reviewed_by: staff.user.id,
      reviewed_at: new Date().toISOString(),
      merged_worker_id: workerId,
    })
    .eq("prospective_id", prospId);

  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `Failed to mark approved: ${upErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    worker_id: workerId,
    rating_recorded: ratingRecorded,
  });
}
