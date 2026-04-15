/**
 * Diagnostic utilities for inspecting Supabase auth cookie state.
 *
 * These functions read and decode the JWT stored in Supabase auth cookies
 * without modifying them. Used to detect the "silent auth failure" where
 * an expired token causes RLS to return empty data with no errors.
 */

const SUPABASE_COOKIE_PREFIX = "sb-";

interface JwtPayload {
  exp?: number;
  sub?: string;
  role?: string;
  aal?: string;
  [key: string]: unknown;
}

interface CookieDiagnostic {
  cookieCount: number;
  hasAuthCookies: boolean;
  accessTokenExp: number | null;
  accessTokenExpired: boolean;
  accessTokenRole: string | null;
  accessTokenSub: string | null;
  secondsUntilExpiry: number | null;
  rawCookieNames: string[];
}

/**
 * Decode a JWT payload without verification (for diagnostic purposes only).
 * Returns null if the token is not a valid JWT.
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Read all Supabase cookies from document.cookie and extract the auth token.
 * Supabase SSR splits the session into chunked cookies:
 *   sb-<ref>-auth-token.0, sb-<ref>-auth-token.1, etc.
 * We reassemble them to decode the JWT.
 */
function readSupabaseCookies(): { names: string[]; reassembled: string | null } {
  if (typeof document === "undefined") {
    return { names: [], reassembled: null };
  }

  const cookies = document.cookie.split(";").map((c) => c.trim());
  const sbCookies: string[] = [];
  const authChunks = new Map<string, string>();

  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf("=");
    if (eqIdx < 0) continue;
    const name = cookie.substring(0, eqIdx);
    const value = cookie.substring(eqIdx + 1);

    if (name.startsWith(SUPABASE_COOKIE_PREFIX)) {
      sbCookies.push(name);

      // Match auth-token chunks: sb-<ref>-auth-token or sb-<ref>-auth-token.N
      const authMatch = name.match(/^sb-[^-]+-auth-token(?:\.(\d+))?$/);
      if (authMatch) {
        const chunkIndex = authMatch[1] ?? "0";
        authChunks.set(chunkIndex, decodeURIComponent(value));
      }
    }
  }

  if (authChunks.size === 0) {
    return { names: sbCookies, reassembled: null };
  }

  // Reassemble chunks in order
  const maxChunk = Math.max(
    ...Array.from(authChunks.keys()).map((k) => parseInt(k, 10))
  );
  let reassembled = "";
  for (let i = 0; i <= maxChunk; i++) {
    reassembled += authChunks.get(String(i)) ?? "";
  }

  return { names: sbCookies, reassembled: reassembled || null };
}

/**
 * Extract the access_token from the reassembled Supabase cookie value.
 * The cookie stores a JSON object like:
 *   { "access_token": "...", "refresh_token": "...", ... }
 * or sometimes just the base64url-encoded session JSON.
 */
function extractAccessToken(cookieValue: string): string | null {
  try {
    // Try parsing as JSON directly
    const parsed = JSON.parse(cookieValue);
    if (typeof parsed.access_token === "string") return parsed.access_token;
    return null;
  } catch {
    // Might be base64-encoded
    try {
      const decoded = atob(cookieValue.replace(/-/g, "+").replace(/_/g, "/"));
      const parsed = JSON.parse(decoded);
      if (typeof parsed.access_token === "string") return parsed.access_token;
    } catch {
      // Not decodable
    }
    return null;
  }
}

/**
 * Get a complete diagnostic snapshot of the current Supabase cookie state.
 */
export function getCookieDiagnostic(): CookieDiagnostic {
  const { names, reassembled } = readSupabaseCookies();
  const now = Math.floor(Date.now() / 1000);

  const base: CookieDiagnostic = {
    cookieCount: names.length,
    hasAuthCookies: reassembled !== null,
    accessTokenExp: null,
    accessTokenExpired: false,
    accessTokenRole: null,
    accessTokenSub: null,
    secondsUntilExpiry: null,
    rawCookieNames: names,
  };

  if (!reassembled) return base;

  const accessToken = extractAccessToken(reassembled);
  if (!accessToken) return base;

  const payload = decodeJwtPayload(accessToken);
  if (!payload) return base;

  const exp = payload.exp ?? null;
  const secondsUntilExpiry = exp !== null ? exp - now : null;

  return {
    ...base,
    accessTokenExp: exp,
    accessTokenExpired: exp !== null && exp < now,
    accessTokenRole: typeof payload.role === "string" ? payload.role : null,
    accessTokenSub: typeof payload.sub === "string" ? payload.sub : null,
    secondsUntilExpiry,
  };
}

/**
 * Log a diagnostic summary of cookie state with a source label.
 * Emits a console.warn when the token is expired or missing.
 */
export function logCookieDiagnostic(source: string): CookieDiagnostic {
  const diag = getCookieDiagnostic();

  if (!diag.hasAuthCookies) {
    console.warn(
      `[cookie-diag] ${source}: NO auth cookies found. Cookie names:`,
      diag.rawCookieNames
    );
  } else if (diag.accessTokenExpired) {
    console.warn(
      `[cookie-diag] ${source}: ACCESS TOKEN EXPIRED ${Math.abs(diag.secondsUntilExpiry ?? 0)}s ago.`,
      `role=${diag.accessTokenRole}, sub=${diag.accessTokenSub?.substring(0, 8)}...`
    );
  } else if (diag.secondsUntilExpiry !== null && diag.secondsUntilExpiry < 600) {
    console.info(
      `[cookie-diag] ${source}: token expires in ${diag.secondsUntilExpiry}s`,
      `role=${diag.accessTokenRole}`
    );
  }

  return diag;
}
