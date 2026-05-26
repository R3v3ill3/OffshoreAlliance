import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { id, listId } = await params;
    const campaignId = Number.parseInt(id, 10);
    const numericListId = Number.parseInt(listId, 10);
    if (!Number.isFinite(campaignId) || !Number.isFinite(numericListId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const serverClient = await createClient();
    const staff = await requireStaffUser(serverClient);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: list, error: listErr } = await serverClient
      .from("call_lists")
      .select("list_id")
      .eq("campaign_id", campaignId)
      .eq("list_id", numericListId)
      .maybeSingle();
    if (listErr) throw listErr;
    if (!list) return NextResponse.json({ error: "Call list not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { tokenId?: unknown };
    let query = serverClient
      .from("call_share_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("list_id", numericListId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("token_id");

    if (typeof body.tokenId === "number" && Number.isFinite(body.tokenId)) {
      query = query.eq("token_id", body.tokenId);
    }

    const { data: revokedRows, error: revokeErr } = await query;
    if (revokeErr) throw revokeErr;

    // Force-release any in-flight claims held by sessions that came in
    // through the revoked tokens, so contacts return to the queue
    // immediately instead of waiting out the 15-minute TTL.
    let totalReleased = 0;
    if (Array.isArray(revokedRows)) {
      for (const row of revokedRows) {
        const tokenId = (row as { token_id?: number }).token_id;
        if (!tokenId) continue;
        const { data: releaseRes } = await serverClient.rpc(
          "force_release_claims_for_token",
          { p_token_id: tokenId },
        );
        const releasedCount = (releaseRes as { released_count?: number } | null)?.released_count;
        if (typeof releasedCount === "number") totalReleased += releasedCount;
      }
    }

    return NextResponse.json({
      ok: true,
      revoked: revokedRows?.length ?? 0,
      released_claims: totalReleased,
    });
  } catch (error) {
    console.error("Revoke call share token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke tokens" },
      { status: 500 },
    );
  }
}
