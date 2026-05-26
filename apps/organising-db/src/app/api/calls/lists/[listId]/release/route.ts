import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * Staff-side mirror of `/api/call-share/[token]/release`.
 *
 * Lets the desktop tracker (and any future staff mobile surface) drop a soft
 * claim it acquired via `/api/calls/lists/[listId]/next`. Without this, staff
 * users would hold a 15-minute TTL on a contact every time they tabbed away
 * mid-call — invisible to other staff and to share-link callers.
 *
 * Beacon-friendly: accepts JSON, plain `item_id` text, or a single integer
 * so the browser can call this on `pagehide` via `navigator.sendBeacon`.
 */

const bodySchema = z.object({
  item_id: z.number().int().positive(),
});

async function readBeaconFriendlyBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return request.json();
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const itemId = Number.parseInt(text, 10);
    return Number.isFinite(itemId) ? { item_id: itemId } : {};
  }
}

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

    const parsed = bodySchema.safeParse(await readBeaconFriendlyBody(request));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const lid = Number.parseInt(listId, 10);
    if (!Number.isFinite(lid)) {
      return NextResponse.json({ error: "Invalid list id" }, { status: 400 });
    }

    // Guard: caller may only release a claim against an item that lives on
    // the list they claim it from. Stops a logged-in staff user from
    // poking other lists' claims.
    const { data: item, error: itemErr } = await supabase
      .from("call_list_items")
      .select("item_id, list_id")
      .eq("item_id", parsed.data.item_id)
      .maybeSingle();
    if (itemErr) {
      console.error("/api/calls/lists/[listId]/release item lookup error:", itemErr);
      return NextResponse.json({ error: "Failed to release claim" }, { status: 500 });
    }
    if (!item || item.list_id !== lid) {
      return NextResponse.json({ error: "Item not on this list" }, { status: 404 });
    }

    const sessionLabel = `staff:${user.id}`;
    const { data, error } = await supabase.rpc("release_call_list_item_claim", {
      p_item_id: parsed.data.item_id,
      p_session_label: sessionLabel,
    });
    if (error) {
      console.error("/api/calls/lists/[listId]/release rpc error:", error);
      return NextResponse.json({ error: "Failed to release claim" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, released: !!data });
  } catch (error) {
    console.error("/api/calls/lists/[listId]/release error:", error);
    return NextResponse.json({ error: "Failed to release claim" }, { status: 500 });
  }
}
