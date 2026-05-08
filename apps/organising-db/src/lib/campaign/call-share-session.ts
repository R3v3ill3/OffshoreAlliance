import { createHmac, timingSafeEqual } from "crypto";

export const CALL_SHARE_SESSION_MAX_AGE_SEC = 4 * 60 * 60;
export const CALL_SHARE_SESSION_COOKIE_PREFIX = "cs_session_";
export const CALL_SHARE_SESSION_COOKIE_PATH = "/";

export type CallShareSessionPayload = {
  tid: number;
  exp: number;
  sl: string;
  swid?: number | null;
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
  return base64urlEncode(createHmac("sha256", secret).update(payloadB64).digest());
}

export function cookieNameFromToken(urlToken: string): string {
  return `${CALL_SHARE_SESSION_COOKIE_PREFIX}${(urlToken || "").slice(0, 8)}`;
}

export function issueCallShareSession(
  tokenId: number,
  urlToken: string,
  label: string,
  workerId?: number | null,
): { cookieName: string; cookieValue: string; maxAgeSec: number } {
  const payload: CallShareSessionPayload = {
    tid: tokenId,
    exp: Math.floor(Date.now() / 1000) + CALL_SHARE_SESSION_MAX_AGE_SEC,
    sl: label.slice(0, 80),
    swid: workerId ?? null,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = sign(payloadB64, getSecret());
  return {
    cookieName: cookieNameFromToken(urlToken),
    cookieValue: `${payloadB64}.${sig}`,
    maxAgeSec: CALL_SHARE_SESSION_MAX_AGE_SEC,
  };
}

export function verifyCallShareSession(
  urlToken: string,
  cookieValue: string | undefined,
): { tokenId: number; label: string; workerId: number | null } | null {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot < 1) return null;
  const payloadB64 = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!payloadB64 || !sig) return null;

  let expectedSig: string;
  try {
    expectedSig = sign(payloadB64, getSecret());
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: CallShareSessionPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8")) as CallShareSessionPayload;
  } catch {
    return null;
  }

  if (
    typeof payload.tid !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.sl !== "string" ||
    payload.sl.length === 0 ||
    payload.sl.length > 80
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.swid != null && typeof payload.swid !== "number") return null;

  void urlToken;

  return {
    tokenId: payload.tid,
    label: payload.sl,
    workerId: payload.swid ?? null,
  };
}
