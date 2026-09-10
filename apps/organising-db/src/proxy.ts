import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { detectMobileUserAgent } from "@/lib/device/detect-mobile";

export async function proxy(request: NextRequest) {
  // Device detection must happen BEFORE updateSession. `src/app/layout.tsx`
  // reads the flag with `headers()`, which returns the *request* headers — a
  // header set on the response never reaches a server component. Mutating
  // `request.headers` here works because updateSession's
  // `NextResponse.next({ request })` re-emits them as
  // `x-middleware-override-headers`, which is what Next feeds back into the
  // server render. Without this the flag was always "desktop" and the touch
  // default for the Workforce board (WP0.3 §2.7) could never fire.
  const isMobile = detectMobileUserAgent(request.headers.get("user-agent"));
  request.headers.set("x-viewport", isMobile ? "mobile" : "desktop");

  const response = await updateSession(request);

  // Also exposed on the response — harmless, and lets a caller/CDN see which
  // variant was rendered.
  response.headers.set("x-viewport", isMobile ? "mobile" : "desktop");

  return response;
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico)$).*)",
  ],
};
