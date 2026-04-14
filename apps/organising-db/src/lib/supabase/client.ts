import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, AuthResponse } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCookieOptions } from "@/lib/supabase/cookie-options";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";

let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getCookieOptions(),
    }
  ) as unknown as SupabaseClient;
  return _client;
}

export function resetClient(): void {
  _client = undefined;
}

/**
 * Global mutex for token refresh. All code paths that need to refresh
 * the session MUST use this instead of calling supabase.auth.refreshSession()
 * directly. This prevents the "Invalid Refresh Token: Already Used" race
 * condition that occurs when multiple concurrent refreshes rotate the
 * single-use refresh token.
 */
let _refreshPromise: Promise<AuthResponse> | null = null;
let _lastRefreshSource: string | null = null;

export function coordinatedRefreshSession(source: string): Promise<AuthResponse> {
  if (_refreshPromise) {
    logConnectionEvent({
      type: "token_refresh_ok",
      detail: `refresh-deduplicated: ${source} joined in-flight refresh from ${_lastRefreshSource}`,
    });
    return _refreshPromise;
  }
  _lastRefreshSource = source;
  const client = createClient();
  _refreshPromise = client.auth.refreshSession().finally(() => {
    _refreshPromise = null;
    _lastRefreshSource = null;
  });
  return _refreshPromise;
}
