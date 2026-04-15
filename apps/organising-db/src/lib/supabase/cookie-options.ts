/**
 * Auth cookie lifetime in seconds. Must be at least as long as the JWT expiry
 * configured in the Supabase dashboard (Authentication → Configuration → JWT expiry).
 * Our Supabase project is configured for 86400s (24 hours). Cookies are set to
 * match that so the browser never discards them before Supabase considers the
 * session expired.
 */
const AUTH_COOKIE_MAX_AGE_SECONDS = 86400;

/**
 * Returns cookie options for Supabase SSR clients.
 * On production (*.uconstruct.app) sets domain to share cookies across subdomains.
 * On other hosts (localhost, Vercel preview) omits domain so cookies are host-only.
 *
 * maxAge is always set to prevent the browser from expiring session cookies
 * earlier than Supabase would, which would trigger unnecessary re-authentication.
 */
export function getCookieOptions(): { domain?: string; path?: string; sameSite?: "lax" | "strict" | "none"; maxAge?: number } {
  const base = { path: "/", sameSite: "lax" as const, maxAge: AUTH_COOKIE_MAX_AGE_SECONDS };

  if (typeof window !== "undefined") {
    if (window.location.hostname.endsWith("uconstruct.app")) {
      return { ...base, domain: ".uconstruct.app" };
    }
    return base;
  }

  // NEXT_PUBLIC_SITE_URL is the canonical app URL env var used throughout this project.
  // NEXT_PUBLIC_APP_URL is checked for backward compat. VERCEL_URL is the Vercel-generated
  // preview URL (does not contain uconstruct.app) and is only a fallback.
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "";
  if (appUrl.includes("uconstruct.app")) {
    return { ...base, domain: ".uconstruct.app" };
  }
  return base;
}
