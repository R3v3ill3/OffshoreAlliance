import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, AuthResponse } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCookieOptions } from "@/lib/supabase/cookie-options";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";

/**
 * Default timeout for all Supabase fetch requests (ms).
 * Without this, the browser fetch API has NO timeout — requests can hang
 * indefinitely when the auth client is in a broken state, causing the
 * infinite loading spinner that requires a browser restart to clear.
 */
const SUPABASE_FETCH_TIMEOUT_MS = 20_000;

/**
 * Wraps the global fetch with an AbortController timeout.
 * This prevents any Supabase request (data queries, auth refreshes, etc.)
 * from hanging indefinitely. Failed requests throw AbortError which the
 * existing error handling infrastructure can catch and handle.
 */
function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Don't override an existing abort signal from the caller
  if (init?.signal) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getCookieOptions(),
      global: { fetch: fetchWithTimeout },
      auth: {
        // Disable the Supabase client's built-in background auto-refresh timer.
        // This is the KEY fix for the refresh token race condition: the timer runs
        // independently of all our coordination code (coordinatedRefreshSession,
        // visibility handler, middleware), and when it consumes a refresh token
        // that was already rotated by the middleware, it triggers an unrecoverable
        // "Invalid Refresh Token: Already Used" error that corrupts the auth state.
        //
        // Token refresh is handled by:
        // 1. Middleware (server-side, on every page navigation)
        // 2. Visibility handler (client-side, on tab focus)
        // 3. Pre-mutation guard (client-side, before writes)
        // All three go through coordinatedRefreshSession() which deduplicates.
        autoRefreshToken: false,
      },
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
