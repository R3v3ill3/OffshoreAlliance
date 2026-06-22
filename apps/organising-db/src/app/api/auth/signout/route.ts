import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-side sign-out endpoint.
 *
 * WHY THIS EXISTS:
 * The client's `supabase.auth.signOut()` goes through the in-tab GoTrueClient.
 * After the laptop wakes / Wi-Fi reconnects (or on a degraded connection),
 * that is the SAME wedged auth path that hangs `getSession()`, so the old
 * client sign-out blocked the full 5s timeout every time before falling
 * through to a local cookie clear (see docs/SUPABASE_DROPOUT_INVESTIGATION.md —
 * the Jun 2026 sign-out-hang finding: every `auth.signOut()` took ~5s, right
 * at the timeout ceiling, while offline/wake transitions surrounded it).
 *
 * This route revokes the session via a FRESH per-request @supabase/ssr client
 * (the reliable server path, same one used by /api/auth/refresh) and clears the
 * auth cookies on its response. The browser client no longer depends on its own
 * (possibly wedged) auth network call to sign out.
 */
export async function POST() {
  try {
    const supabase = await createClient();

    // Revokes the refresh token server-side and clears the sb-* cookies via the
    // server client's cookie handler (applied to this response).
    const { error } = await supabase.auth.signOut();

    if (error) {
      const status = (error as { status?: number }).status;
      // A missing/expired session means the device is effectively already
      // signed out — treat as success (the cookie clear still happens).
      const benign =
        error.name === "AuthSessionMissingError" || status === 401 || status === 403;
      if (!benign) {
        return NextResponse.json({ ok: false, reason: "error", message: error.message });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: "exception",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
