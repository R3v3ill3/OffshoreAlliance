import { NextResponse } from "next/server";

/**
 * Does not return secrets. Use after deploy to confirm Vercel passed
 * NEXT_PUBLIC_* into the build/runtime for this app.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key =
    process.env.NEXT_PUBLIC_POSTHOG_KEY ??
    process.env.NEXT_PUBLIC_POSTHOG_TOKEN ??
    process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  let hostLooksLikeIngest = false;
  if (host?.trim()) {
    try {
      const { hostname } = new URL(host.trim());
      hostLooksLikeIngest = hostname === "i.posthog.com" || hostname.endsWith(".i.posthog.com");
    } catch {
      hostLooksLikeIngest = false;
    }
  }

  return NextResponse.json({
    hasKey: Boolean(key?.trim()),
    hasHost: Boolean(host?.trim()),
    keyPrefix: key?.trim() ? String(key).slice(0, 4) : null,
    hostLooksLikeIngest,
  });
}
