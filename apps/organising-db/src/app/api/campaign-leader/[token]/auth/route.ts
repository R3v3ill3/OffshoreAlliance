/**
 * POST /api/campaign-leader/[token]/auth
 *
 * Leader-form password gate (Phase 2). Unauthenticated route — uses the admin client
 * and enforces auth itself via the URL token + submitted password.
 *
 * Request:  { password: string }
 * Success:  200 { ok: true }  + Set-Cookie session
 * Failure:  401 { ok: false, attempts_remaining, locked_until? }
 *           410 { error: 'Link expired or revoked' }
 *           423 { error: 'Locked out', locked_until }
 *
 * Lockout policy: 5 consecutive failed attempts -> 15-minute lock; counter resets to 0
 * on lockout and on successful auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLeaderToken } from "@/lib/campaign/token-crypto";
import { verifyPassword } from "@/lib/campaign/password-crypto";
import {
  LEADER_SESSION_COOKIE_PATH,
  LEADER_SESSION_MAX_AGE_SEC,
  issueLeaderSession,
} from "@/lib/campaign/leader-session";
import { leaderAuthRequestSchema } from "@/lib/validation/campaign-leader";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function clientIpHash(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const candidate = (xff?.split(",")[0]?.trim() || realIp || "").trim();
  if (!candidate) return null;
  return createHash("sha256").update(candidate, "utf8").digest("hex");
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = leaderAuthRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    const token_hash = hashLeaderToken(rawToken);

    const { data: tokenRow, error: tErr } = await admin
      .from("campaign_leader_tokens")
      .select(
        "token_id, task_list_id, password_hash, password_algo, expires_at, revoked_at, locked_until, failed_attempts",
      )
      .eq("token_hash", token_hash)
      .maybeSingle();

    if (tErr || !tokenRow) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    if (tokenRow.revoked_at) {
      return NextResponse.json({ error: "Link revoked" }, { status: 410 });
    }
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }
    if (tokenRow.locked_until && new Date(tokenRow.locked_until) > new Date()) {
      return NextResponse.json(
        { ok: false, error: "Too many failed attempts", locked_until: tokenRow.locked_until },
        { status: 423 },
      );
    }

    if (!tokenRow.password_hash || !tokenRow.password_algo) {
      // Pre-Phase-2 row that was not auto-revoked. Treat as invalid.
      return NextResponse.json({ error: "Link not configured for password auth" }, { status: 410 });
    }

    let ok = false;
    try {
      ok = await verifyPassword(parsed.data.password, tokenRow.password_hash, tokenRow.password_algo);
    } catch {
      // Unknown algo / bad hash → treat as auth failure but do not surface details.
      ok = false;
    }

    const ip_hash = clientIpHash(request);
    const nowIso = new Date().toISOString();

    if (!ok) {
      const newAttempts = (tokenRow.failed_attempts ?? 0) + 1;
      const reachedLimit = newAttempts >= MAX_ATTEMPTS;
      const update: Record<string, unknown> = reachedLimit
        ? {
            failed_attempts: 0,
            locked_until: new Date(Date.now() + LOCK_DURATION_MS).toISOString(),
          }
        : { failed_attempts: newAttempts };
      await admin
        .from("campaign_leader_tokens")
        .update(update)
        .eq("token_id", tokenRow.token_id);

      await admin.from("campaign_leader_form_events").insert({
        token_id: tokenRow.token_id,
        event_type: "auth_fail",
        payload: { attempts: newAttempts, locked: reachedLimit },
        ip_hash,
      });

      const attempts_remaining = reachedLimit ? 0 : MAX_ATTEMPTS - newAttempts;
      const responseBody: {
        ok: false;
        attempts_remaining: number;
        locked_until?: string;
      } = { ok: false, attempts_remaining };
      if (reachedLimit) {
        responseBody.locked_until = (update.locked_until as string);
      }
      return NextResponse.json(responseBody, { status: reachedLimit ? 423 : 401 });
    }

    // Success — reset counters, mark used, issue cookie, audit.
    await admin
      .from("campaign_leader_tokens")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_used_at: nowIso,
      })
      .eq("token_id", tokenRow.token_id);

    await admin.from("campaign_leader_form_events").insert({
      token_id: tokenRow.token_id,
      event_type: "auth_success",
      ip_hash,
    });

    const session = issueLeaderSession(tokenRow.token_id, rawToken);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(session.cookieName, session.cookieValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: LEADER_SESSION_COOKIE_PATH,
      maxAge: LEADER_SESSION_MAX_AGE_SEC,
    });
    return res;
  } catch (e) {
    if (e instanceof Error && e.message.includes("Missing NEXT_PUBLIC_SUPABASE_URL")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Auth failed" }, { status: 500 });
  }
}
