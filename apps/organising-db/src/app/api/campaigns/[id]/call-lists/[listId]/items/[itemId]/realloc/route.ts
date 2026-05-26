import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { z } from "zod";

/**
 * Coordinator re-allocation API for a single call-list item.
 *
 * Supports three actions in one endpoint:
 *
 *   { action: "requeue" }
 *     Clears any attempt-driven status (completed / deferred / in_progress)
 *     and returns the item to `pending`. Used when a coordinator wants the
 *     contact to be called again — e.g. an automated outcome was wrong.
 *
 *   { action: "exclude_from_share" }
 *   { action: "include_in_share" }
 *     Toggles the `excluded_from_share` flag so share-link callers skip the
 *     contact. Coordinator can still call them via the staff dialer.
 *
 * Force-releasing an active claim is exposed separately via the
 * `/share-tokens/force-release` route so it can target either an item or a
 * whole token in one call.
 */
const bodySchema = z.object({
  action: z.enum(["requeue", "exclude_from_share", "include_in_share"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string; itemId: string }> },
) {
  try {
    const { id, listId, itemId } = await params;
    const campaignId = Number.parseInt(id, 10);
    const numericListId = Number.parseInt(listId, 10);
    const numericItemId = Number.parseInt(itemId, 10);
    if (!Number.isFinite(campaignId) || !Number.isFinite(numericListId) || !Number.isFinite(numericItemId)) {
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

    const { data: item, error: itemErr } = await supabase
      .from("call_list_items")
      .select("item_id, list_id")
      .eq("item_id", numericItemId)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item || item.list_id !== numericListId) {
      return NextResponse.json({ error: "Item not on this list" }, { status: 404 });
    }

    const now = new Date().toISOString();
    if (parsed.data.action === "requeue") {
      const { error } = await supabase
        .from("call_list_items")
        .update({
          status: "pending",
          claimed_at: null,
          claimed_by_session_label: null,
          claimed_by_worker_id: null,
          claimed_by_share_token_id: null,
          next_call_at: null,
          updated_at: now,
        })
        .eq("item_id", numericItemId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("call_list_items")
        .update({
          excluded_from_share: parsed.data.action === "exclude_from_share",
          updated_at: now,
        })
        .eq("item_id", numericItemId);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Call list item realloc error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reallocate item" },
      { status: 500 },
    );
  }
}
