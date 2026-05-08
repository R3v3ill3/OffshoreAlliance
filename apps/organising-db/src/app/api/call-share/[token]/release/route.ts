import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  logCallShareEvent,
  requireCallShareSession,
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";
import { shareReleaseSchema } from "@/lib/validation/call-share";

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
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const parsed = shareReleaseSchema.safeParse(await readBeaconFriendlyBody(request));
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

    const { data, error } = await admin.rpc("release_call_list_item_claim", {
      p_item_id: parsed.data.item_id,
      p_session_label: session.label,
    });
    if (error) throw error;

    await logCallShareEvent(
      admin,
      tokenRow.token_id,
      "claim_released",
      { item_id: parsed.data.item_id, released: !!data },
      session.workerId,
    );

    return NextResponse.json({ ok: true, released: !!data });
  } catch (error) {
    console.error("Call share release error:", error);
    return NextResponse.json({ error: "Failed to release claim" }, { status: 500 });
  }
}
