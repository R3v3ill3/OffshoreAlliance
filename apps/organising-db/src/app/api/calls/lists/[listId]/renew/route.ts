import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * Staff-side mirror of `/api/call-share/[token]/renew`. Pushes the soft-claim
 * TTL forward when the desktop caller (or future staff mobile surface) is
 * actively engaged with the contact.
 */
const bodySchema = z.object({
  item_id: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  try {
    const { listId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const lid = Number.parseInt(listId, 10);
    if (!Number.isFinite(lid)) {
      return NextResponse.json({ error: "Invalid list id" }, { status: 400 });
    }

    const { data: item, error: itemErr } = await supabase
      .from("call_list_items")
      .select("item_id, list_id")
      .eq("item_id", parsed.data.item_id)
      .maybeSingle();
    if (itemErr) {
      console.error("/api/calls/lists/[listId]/renew item lookup error:", itemErr);
      return NextResponse.json({ error: "Failed to renew claim" }, { status: 500 });
    }
    if (!item || item.list_id !== lid) {
      return NextResponse.json({ error: "Item not on this list" }, { status: 404 });
    }

    const sessionLabel = `staff:${user.id}`;
    const { data, error } = await supabase.rpc("renew_call_list_item_claim", {
      p_item_id: parsed.data.item_id,
      p_session_label: sessionLabel,
    });
    if (error) {
      console.error("/api/calls/lists/[listId]/renew rpc error:", error);
      return NextResponse.json({ error: "Failed to renew claim" }, { status: 500 });
    }

    return NextResponse.json(data ?? { renewed: false, claimed_at: null });
  } catch (error) {
    console.error("/api/calls/lists/[listId]/renew error:", error);
    return NextResponse.json({ error: "Failed to renew claim" }, { status: 500 });
  }
}
