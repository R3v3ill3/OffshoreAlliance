import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPassword } from "@/lib/campaign/password-crypto";
import {
  CALL_SHARE_SESSION_COOKIE_PATH,
  CALL_SHARE_SESSION_MAX_AGE_SEC,
  issueCallShareSession,
} from "@/lib/campaign/call-share-session";
import { shareAuthSchema } from "@/lib/validation/call-share";
import {
  clientIpHash,
  logCallShareEvent,
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

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

    const parsed = shareAuthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    const outcome = await resolveCallShareTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;
    const tokenRow = outcome.row;
    const ip_hash = clientIpHash(request);

    const { data: fullToken, error: tokenErr } = await admin
      .from("call_share_tokens")
      .select("password_hash, password_algo, failed_attempts, list_id")
      .eq("token_id", tokenRow.token_id)
      .maybeSingle();
    if (tokenErr || !fullToken) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    let ok = false;
    try {
      ok = await verifyPassword(parsed.data.password, fullToken.password_hash, fullToken.password_algo);
    } catch {
      ok = false;
    }

    if (!ok) {
      const newAttempts = (fullToken.failed_attempts ?? 0) + 1;
      const reachedLimit = newAttempts >= MAX_ATTEMPTS;
      const update = reachedLimit
        ? {
            failed_attempts: 0,
            locked_until: new Date(Date.now() + LOCK_DURATION_MS).toISOString(),
          }
        : { failed_attempts: newAttempts };
      await admin.from("call_share_tokens").update(update).eq("token_id", tokenRow.token_id);
      await logCallShareEvent(
        admin,
        tokenRow.token_id,
        "auth_fail",
        { attempts: newAttempts, locked: reachedLimit },
        null,
        ip_hash,
      );
      const attempts_remaining = reachedLimit ? 0 : MAX_ATTEMPTS - newAttempts;
      return NextResponse.json(
        {
          ok: false,
          attempts_remaining,
          locked_until: reachedLimit ? (update.locked_until as string) : undefined,
        },
        { status: reachedLimit ? 423 : 401 },
      );
    }

    const { data: list } = await admin
      .from("call_lists")
      .select("campaign_id")
      .eq("list_id", fullToken.list_id)
      .maybeSingle();

    if (parsed.data.sessionWorkerId != null) {
      const { data: membership, error: membershipErr } = await admin
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", list?.campaign_id)
        .eq("worker_id", parsed.data.sessionWorkerId)
        .maybeSingle();
      if (membershipErr) throw membershipErr;
      if (!membership) {
        return NextResponse.json({ error: "Selected worker is not in this campaign" }, { status: 400 });
      }
    }

    const nowIso = new Date().toISOString();
    await admin
      .from("call_share_tokens")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_used_at: nowIso,
      })
      .eq("token_id", tokenRow.token_id);

    await logCallShareEvent(admin, tokenRow.token_id, "auth_success", null, null, ip_hash);
    await logCallShareEvent(
      admin,
      tokenRow.token_id,
      "identity_set",
      { label: parsed.data.sessionLabel, worker_id: parsed.data.sessionWorkerId ?? null },
      parsed.data.sessionWorkerId ?? null,
      ip_hash,
    );

    const session = issueCallShareSession(
      tokenRow.token_id,
      rawToken,
      parsed.data.sessionLabel,
      parsed.data.sessionWorkerId ?? null,
    );
    const res = NextResponse.json({ ok: true });
    res.cookies.set(session.cookieName, session.cookieValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: CALL_SHARE_SESSION_COOKIE_PATH,
      maxAge: CALL_SHARE_SESSION_MAX_AGE_SEC,
    });
    return res;
  } catch (error) {
    console.error("Call share auth error:", error);
    return NextResponse.json({ error: "Auth failed" }, { status: 500 });
  }
}
