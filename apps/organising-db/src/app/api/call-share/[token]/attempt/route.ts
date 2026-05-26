import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  logCallShareEvent,
  requireCallShareSession,
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";
import { shareAttemptSchema } from "@/lib/validation/call-share";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const json = await request.json();
    const parsed = shareAttemptSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    const outcome = await resolveCallShareTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;
    const tokenRow = outcome.row;

    const session = requireCallShareSession(request, rawToken, tokenRow);
    if (!session) return NextResponse.json({ requires_password: true }, { status: 401 });

    const { data: item, error: itemErr } = await admin
      .from("call_list_items")
      .select("item_id, list_id")
      .eq("item_id", parsed.data.list_item_id)
      .eq("list_id", tokenRow.list_id)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) return NextResponse.json({ error: "Contact is not on this call list" }, { status: 404 });

    const body = parsed.data;
    // JSONB params go as real arrays — never JSON.stringify, see
    // /api/calls/attempts/route.ts for the explanation.
    const { data, error } = await admin.rpc("record_call_attempt", {
      p_list_item_id: body.list_item_id,
      p_script_id: body.script_id ?? null,
      p_caller_user_id: tokenRow.issued_by,
      p_dial_disposition: body.dial_disposition,
      p_call_disposition: body.call_disposition ?? null,
      p_overall_notes: body.overall_notes ?? null,
      p_callback_datetime: body.callback_datetime ?? null,
      p_support_level: body.support_level_assessed ?? null,
      p_follow_up_action: body.follow_up_action ?? null,
      p_cta_response: body.cta_response ?? null,
      p_duration_seconds: body.duration_seconds ?? null,
      p_step_outcomes: Array.isArray(body.step_outcomes) ? body.step_outcomes : [],
      p_objections: Array.isArray(body.objections) ? body.objections : [],
      p_issues: Array.isArray(body.issues) ? body.issues : [],
      p_cta_ratings: Array.isArray(body.cta_ratings) ? body.cta_ratings : [],
      p_assessment_ratings: Array.isArray(body.assessment_ratings)
        ? body.assessment_ratings
        : [],
      p_action_id: body.action_id ?? null,
      p_outcome_classification: body.outcome_classification ?? null,
      p_share_token_id: tokenRow.token_id,
      p_caller_leader_worker_id: tokenRow.leader_worker_id,
      p_caller_session_label: session.label,
      p_caller_session_worker_id: session.workerId,
    });
    if (error) throw error;

    await logCallShareEvent(
      admin,
      tokenRow.token_id,
      "attempt_recorded",
      { item_id: body.list_item_id, attempt_id: (data as { attempt_id?: number })?.attempt_id ?? null },
      session.workerId,
    );

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Call share attempt error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record call attempt" },
      { status: 500 },
    );
  }
}
