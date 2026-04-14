/**
 * Returns cookie options for Supabase SSR clients.
 * On production (*.uconstruct.app) sets domain to share cookies across subdomains.
 * On other hosts (localhost, Vercel preview) omits domain so cookies are host-only.
 */
export function getCookieOptions(): { domain?: string; path?: string; sameSite?: "lax" | "strict" | "none" } {
  const base = { path: "/", sameSite: "lax" as const };

  if (typeof window !== "undefined") {
    if (window.location.hostname.endsWith("uconstruct.app")) {
      return { ...base, domain: ".uconstruct.app" };
    }
    return base;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "";
  if (appUrl.includes("uconstruct.app")) {
    return { ...base, domain: ".uconstruct.app" };
  }
  return base;
}
