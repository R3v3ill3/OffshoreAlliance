import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  logCallShareEvent,
  requireCallShareSession,
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";
import { fetchAndEnrichCallListItem } from "@/lib/phone/enrich-call-list-item";

const CLAIM_TTL_SECONDS = 15 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();
    const outcome = await resolveCallShareTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;
    const tokenRow = outcome.row;

    const session = requireCallShareSession(request, rawToken, tokenRow);
    if (!session) return NextResponse.json({ requires_password: true }, { status: 401 });

    const { data: itemId, error: claimErr } = await admin.rpc("claim_next_call_list_item", {
      p_list_id: tokenRow.list_id,
      p_session_label: session.label,
      p_session_worker_id: session.workerId,
      p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
      p_share_token_id: tokenRow.token_id,
    });
    if (claimErr) throw claimErr;
    if (!itemId) {
      return NextResponse.json({ done: true, message: "No more contacts to call" });
    }

    const { data: list } = await admin
      .from("call_lists")
      .select("campaign_id")
      .eq("list_id", tokenRow.list_id)
      .maybeSingle();

    const enriched = await fetchAndEnrichCallListItem(admin, itemId as number, list?.campaign_id as number);
    await logCallShareEvent(
      admin,
      tokenRow.token_id,
      "claim_acquired",
      { item_id: itemId },
      session.workerId,
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Call share next error:", error);
    return NextResponse.json({ error: "Failed to get next contact" }, { status: 500 });
  }
}
