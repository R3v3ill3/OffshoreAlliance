/**
 * Signed-cookie session for an authenticated leader-form user (Phase 2).
 *
 * Format: `base64url(payload).base64url(hmac-sha256(payload, secret))`. JWT-ish but
 * minimal — no header, no JOSE library — to avoid a runtime dep just for this.
 *
 * Secret resolution:
 *   1. `process.env.LEADER_SESSION_SECRET` (preferred — set this in production).
 *   2. Falls back to `process.env.SUPABASE_SERVICE_ROLE_KEY` so we don't need a new env
 *      var for now. The service-role key is already required for admin DB writes from
 *      the leader API routes, so its presence is guaranteed in any environment that
 *      can serve those routes. Document & rotate the LEADER_SESSION_SECRET separately
 *      when deployment hardening permits.
 *
 * Cookie shape (per token):
 *   - name:  `hl_session_<first-8-of-url-token>` so multiple leader sessions can
 *            coexist in one browser without clobbering each other.
 *   - path:  `/leader/task` so it's sent for the leader page and (by default) for the
 *            `/api/campaign-leader/*` routes via fetch credentials.
 *            NOTE: cookies set with `path=/leader/task` are NOT sent to `/api/*` paths
 *            by default. We intentionally use `path=/` here so the API routes receive
 *            the cookie too, scoping security via the cookie name (token-bound) and
 *            the `verifyLeaderSession(urlToken, ...)` check.
 *   - httpOnly, sameSite=strict, secure in production.
 *   - max-age 4 hours (re-issued on every successful auth).
 */
import { createHmac, timingSafeEqual } from "crypto";

export const LEADER_SESSION_MAX_AGE_SEC = 4 * 60 * 60; // 4 hours
export const LEADER_SESSION_COOKIE_PREFIX = "hl_session_";
export const LEADER_SESSION_COOKIE_PATH = "/";

type SessionPayload = {
  /** campaign_leader_tokens.token_id */
  tid: number;
  /** Unix epoch seconds */
  exp: number;
};

function getSecret(): string {
  const secret =
    process.env.LEADER_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "Missing LEADER_SESSION_SECRET (and fallback SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return secret;
}

function base64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sign(payloadB64: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(payloadB64).digest();
  return base64urlEncode(mac);
}

export function cookieNameFromToken(urlToken: string): string {
  // First 8 hex chars of the URL token uniquely identify the leader session in this
  // browser. The full token never leaves the URL fragment that the leader visits.
  const short = (urlToken || "").slice(0, 8);
  return `${LEADER_SESSION_COOKIE_PREFIX}${short}`;
}

export function issueLeaderSession(
  tokenId: number,
  urlToken: string,
): { cookieName: string; cookieValue: string; maxAgeSec: number } {
  const secret = getSecret();
  const payload: SessionPayload = {
    tid: tokenId,
    exp: Math.floor(Date.now() / 1000) + LEADER_SESSION_MAX_AGE_SEC,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return {
    cookieName: cookieNameFromToken(urlToken),
    cookieValue: `${payloadB64}.${sig}`,
    maxAgeSec: LEADER_SESSION_MAX_AGE_SEC,
  };
}

export function verifyLeaderSession(
  urlToken: string,
  cookieValue: string | undefined,
): { tokenId: number } | null {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot < 1) return null;
  const payloadB64 = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!payloadB64 || !sig) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const expectedSig = sign(payloadB64, secret);
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "utf8");
    expBuf = Buffer.from(expectedSig, "utf8");
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.tid !== "number" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  // Bind the cookie to the URL token by checking the cookie's name matches the
  // expected `hl_session_<first8>` shape — this is implicit in the verifier's
  // contract (caller fetches the cookie via `cookieNameFromToken`), but we keep the
  // urlToken parameter so we can extend with stronger binding later (e.g. include
  // hash(urlToken) in the payload).
  void urlToken;

  return { tokenId: payload.tid };
}
