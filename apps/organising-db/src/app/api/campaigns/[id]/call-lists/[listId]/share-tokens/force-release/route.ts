import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { z } from "zod";

/**
 * Coordinator-only "force release claims" endpoint.
 *
 * Accepts either:
 *   - `{ tokenId }` — release every claim held by sessions that came in
 *     through that share token, without revoking the token itself.
 *   - `{ itemId }` — release a single claim (regardless of who's holding it)
 *     so the contact returns to the queue immediately.
 *
 * Used by the live action dashboard's per-caller and per-token panels so
 * coordinators can reclaim contacts from idle or abandoned sessions without
 * waiting out the 15-minute TTL.
 */
const bodySchema = z.union([
  z.object({ tokenId: z.number().int().positive() }),
  z.object({ itemId: z.number().int().positive() }),
]);

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

    const supabase = await createClient();
    const staff = await requireStaffUser(supabase);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { data: list, error: listErr } = await supabase
      .from("call_lists")
      .select("list_id")
      .eq("campaign_id", campaignId)
      .eq("list_id", numericListId)
      .maybeSingle();
    if (listErr) throw listErr;
    if (!list) return NextResponse.json({ error: "Call list not found" }, { status: 404 });

    if ("tokenId" in parsed.data) {
      const { data: token, error: tokenErr } = await supabase
        .from("call_share_tokens")
        .select("token_id, list_id")
        .eq("token_id", parsed.data.tokenId)
        .maybeSingle();
      if (tokenErr) throw tokenErr;
      if (!token || token.list_id !== numericListId) {
        return NextResponse.json({ error: "Token not on this list" }, { status: 404 });
      }
      const { data, error: rpcErr } = await supabase.rpc(
        "force_release_claims_for_token",
        { p_token_id: parsed.data.tokenId },
      );
      if (rpcErr) throw rpcErr;
      const releasedCount =
        (data as { released_count?: number } | null)?.released_count ?? 0;
      return NextResponse.json({ ok: true, released_claims: releasedCount });
    }

    // Single-item release path. Verify the item belongs to this list and
    // is currently claimed, then clear the claim atomically.
    const { data: item, error: itemErr } = await supabase
      .from("call_list_items")
      .select("item_id, list_id, status")
      .eq("item_id", parsed.data.itemId)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item || item.list_id !== numericListId) {
      return NextResponse.json({ error: "Item not on this list" }, { status: 404 });
    }

    const { error: updateErr } = await supabase
      .from("call_list_items")
      .update({
        status: "pending",
        claimed_at: null,
        claimed_by_session_label: null,
        claimed_by_worker_id: null,
        claimed_by_share_token_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("item_id", parsed.data.itemId)
      .eq("status", "in_progress");
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true, released_claims: 1 });
  } catch (error) {
    console.error("Force-release claims error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to release claims" },
      { status: 500 },
    );
  }
}
