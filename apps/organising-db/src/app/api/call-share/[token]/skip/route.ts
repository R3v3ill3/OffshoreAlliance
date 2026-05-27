import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  logCallShareEvent,
  requireCallShareSession,
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";
import { shareReleaseSchema } from "@/lib/validation/call-share";

/**
 * POST /api/call-share/[token]/skip
 *
 * Deprioritises a contact after the caller skips it:
 *   • Releases the in_progress claim (if still held by this session)
 *   • Increments call_list_items.skip_count
 *   • Bumps sort_order to MAX(sort_order)+1 so the contact goes to the
 *     back of the queue and won't be offered again until every other
 *     pending contact has been attempted.
 *
 * This is idempotent — calling it on a contact that is already pending
 * (e.g. after an in-call skip via recordAttempt) is safe and will still
 * push it to the bottom.
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

    const parsed = shareReleaseSchema.safeParse(await request.json().catch(() => ({})));
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

    const { data: skipped, error } = await admin.rpc("skip_call_list_item_for_share", {
      p_item_id: parsed.data.item_id,
      p_list_id: tokenRow.list_id,
      p_session_label: session.label,
    });
    if (error) throw error;

    await logCallShareEvent(
      admin,
      tokenRow.token_id,
      "contact_skipped",
      { item_id: parsed.data.item_id, deprioritised: !!skipped },
      session.workerId,
    );

    return NextResponse.json({ ok: true, deprioritised: !!skipped });
  } catch (error) {
    console.error("Call share skip error:", error);
    return NextResponse.json({ error: "Failed to skip contact" }, { status: 500 });
  }
}
