import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-side session refresh endpoint.
 *
 * WHY THIS EXISTS:
 * The client's `getSession()` performs a BLOCKING network token refresh
 * whenever the stored access token is within `EXPIRY_MARGIN_MS` (90s) of
 * expiry. After the laptop wakes / Wi-Fi reconnects (or a tab returns from a
 * long hidden period), that client-side refresh fetch stalls for >12s and
 * produces the `lock_timeout` cascade documented in
 * docs/SUPABASE_DROPOUT_INVESTIGATION.md.
 *
 * The SERVER↔Supabase path stays reliable in exactly those moments (it is the
 * same path the middleware uses, and the reason a full reload recovers). This
 * route refreshes the session cookie server-side via @supabase/ssr. After it
 * returns, the browser cookie holds a fresh, long-lived token, so the client's
 * next getSession()/query reads it WITHOUT a network refresh.
 *
 * Single-writer model: the CLIENT never rotates tokens (autoRefreshToken is
 * off); only the middleware and this route do — which avoids the
 * "Invalid Refresh Token: Already Used" race.
 */

// Rotate proactively when the current token has less than this remaining, so
// the browser receives a fresh full-lifetime token rather than one that is
// about to force another refresh.
const PROACTIVE_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export async function POST() {
  try {
    const supabase = await createClient();

    // getUser() validates the token and, when it is expired, refreshes it via
    // the cookie refresh token — persisting the rotated cookies on the response.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      const status = (userError as { status?: number }).status;
      const isMissingSession =
        userError.name === "AuthSessionMissingError" || status === 401 || status === 403;
      return NextResponse.json({
        ok: false,
        reason: isMissingSession ? "no_session" : "error",
      });
    }

    if (!user) {
      return NextResponse.json({ ok: false, reason: "no_session" });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const expiresAt = session?.expires_at ?? null;
    const expMs = expiresAt ? expiresAt * 1000 : 0;

    // If the (valid) token is close to expiry, rotate it now so the client gets
    // a fresh long-lived token and never has to refresh client-side.
    if (session && expMs - Date.now() < PROACTIVE_REFRESH_WINDOW_MS) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session) {
        return NextResponse.json({
          ok: true,
          expiresAt: refreshed.session.expires_at ?? expiresAt,
        });
      }
    }

    return NextResponse.json({ ok: true, expiresAt });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: "exception",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
