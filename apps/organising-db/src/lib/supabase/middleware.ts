import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCookieOptions } from "@/lib/supabase/cookie-options";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  let cookiesWereRefreshed = false;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesWereRefreshed = cookiesToSet.length > 0;
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  function redirectWithCookies(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  if (
    !user &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth") &&
    // Leader-form pages are token-gated (URL token + password session cookie);
    // they must remain accessible without a Supabase user session.
    !pathname.startsWith("/leader/task") &&
    // Shareable mobile call dialer is token-gated (URL token + password session
    // cookie); volunteers must reach it without a Supabase user session.
    !pathname.startsWith("/call/") &&
    // Public email-recipient endpoints: click-tracking redirector and the
    // unsubscribe page. Both are token-addressed and must work for
    // recipients with no app session.
    !pathname.startsWith("/r/") &&
    !pathname.startsWith("/u/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/campaigns";
    return redirectWithCookies(url);
  }

  if (cookiesWereRefreshed) {
    supabaseResponse.headers.set("x-supabase-cookies-refreshed", "1");
  }

  return supabaseResponse;
}
