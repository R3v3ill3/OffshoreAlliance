import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireCallShareSession,
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";
import { shareRenewSchema } from "@/lib/validation/call-share";

/**
 * Renew (refresh) the soft claim TTL on the active contact for a share-link
 * caller. The mobile dialer pings this whenever the caller is actively
 * interacting with the in-call surface so the 15-minute TTL never expires
 * mid-conversation.
 *
 * Returns `{ renewed: boolean, claimed_at: string|null }` so the UI can
 * reset its countdown immediately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const parsed = shareRenewSchema.safeParse(await request.json().catch(() => ({})));
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

    const { data, error } = await admin.rpc("renew_call_list_item_claim", {
      p_item_id: parsed.data.item_id,
      p_session_label: session.label,
    });
    if (error) {
      console.error("Call share renew rpc error:", error);
      return NextResponse.json({ error: "Failed to renew claim" }, { status: 500 });
    }

    return NextResponse.json(data ?? { renewed: false, claimed_at: null });
  } catch (error) {
    console.error("Call share renew error:", error);
    return NextResponse.json({ error: "Failed to renew claim" }, { status: 500 });
  }
}
