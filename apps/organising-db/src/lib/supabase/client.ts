import { createBrowserClient } from "@supabase/ssr";
// processLock is re-exported by supabase-js from auth-js. Importing from
// supabase-js avoids declaring a direct auth-js dependency.
import { processLock, type SupabaseClient, type AuthResponse, type Session } from "@supabase/supabase-js";
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
 * Maximum time to wait for any single supabase.auth.* call.
 *
 * Set to 12 s (was 6 s — too aggressive). When a sibling tab opens and its
 * middleware rotates the refresh cookie, our tab's getSession() may trigger
 * a fresh refresh-token fetch against Supabase auth. Cold starts plus
 * cross-tab refresh-token contention can legitimately push this over 6 s
 * even on a healthy connection — so 6 s was misclassifying transient
 * slowness as auth failure and triggering forceLogoutToLogin.
 *
 * 12 s is below our fetch timeout (20 s) but well above the realistic
 * upper bound for a healthy refresh.
 *
 * Callers must NEVER treat a timeout as confirmed auth failure: the
 * underlying call may still complete after the wrapper rejects, and
 * even if it doesn't, an inflight 401 from a real query will route us
 * through the proper recovery path with cleaner signals.
 */
const SUPABASE_AUTH_OP_TIMEOUT_MS = 12_000;

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
        // The timer runs independently of all our coordination code
        // (coordinatedRefreshSession, visibility handler, middleware), and when
        // it consumes a refresh token that was already rotated by the middleware,
        // it triggers an unrecoverable "Invalid Refresh Token: Already Used"
        // error that corrupts the auth state.
        //
        // Token refresh is handled by:
        // 1. Middleware (server-side, on every page navigation)
        // 2. Visibility handler (client-side, on tab focus)
        // 3. Pre-mutation guard (client-side, before writes)
        // All three go through coordinatedRefreshSession() which deduplicates.
        autoRefreshToken: false,

        // PRIMARY FIX for the cross-tab connection-loss issue.
        //
        // By default, @supabase/auth-js uses the browser's navigator.locks API
        // ("navigatorLock") to coordinate auth operations across browser tabs of
        // the same origin. When two tabs are open and one tab's getSession() /
        // getUser() / refreshSession() takes longer than 5 seconds (the
        // hard-coded acquireTimeout — auth.lockAcquireTimeout is silently
        // dropped in supabase-js, see issue #2308), the second tab forcibly
        // STEALS the lock, causing the first tab's auth call to reject with:
        //   "AbortError: Lock broken by another request with the 'steal' option"
        // The first tab's auth state then becomes inconsistent, and subsequent
        // queries either fail silently or hang.
        //
        // processLock is auth-js's in-tab promise-queue alternative. It
        // serializes auth operations within the tab (matching what auth-js's
        // _acquireLock requires for re-entrancy) but does NOT touch
        // navigator.locks. Cross-tab serialization is forfeited, but:
        //   - Refresh tokens are still serialized server-side (single-use).
        //   - Cookie writes are last-writer-wins with the same value.
        //   - SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED still propagate cross-tab
        //     via auth-js's BroadcastChannel (unaffected by removing the lock).
        //   - Our coordinatedRefreshSession() mutex serializes within a tab.
        //
        // See plan: cuddly-herding-acorn.md (Workstream A).
        // Source: node_modules/@supabase/auth-js/src/lib/locks.ts (processLock).
        lock: processLock,
      },
    }
  ) as unknown as SupabaseClient;
  return _client;
}

/**
 * Wraps any auth-client promise in a hard timeout. Used to prevent
 * supabase.auth.getSession() / getUser() etc. from blocking the UI
 * indefinitely if the auth layer (storage, broadcast channel, etc.) hangs.
 *
 * On timeout, logs a connection event and rejects with a tagged error so
 * callers can detect the timeout and trigger recovery rather than hang.
 */
export async function withAuthOpTimeout<T>(
  source: string,
  promise: PromiseLike<T>,
  timeoutMs: number = SUPABASE_AUTH_OP_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      logConnectionEvent({
        type: "lock_timeout",
        detail: `auth-op-timeout: ${source} after ${timeoutMs}ms`,
      });
      const err = new Error(`Supabase auth op '${source}' timed out after ${timeoutMs}ms`);
      (err as Error & { isAuthOpTimeout?: boolean }).isAuthOpTimeout = true;
      reject(err);
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Shared getSession() with a 12-second timeout. Use this everywhere outside
 * coordinatedRefreshSession (which has its own 12-second timeout) and
 * recoverSessionConnection (which has its own 15-second timeout).
 *
 * Heartbeat + visibility handlers can fire close together when a tab returns
 * to focus. Reuse one in-flight getSession() call so they don't cascade into
 * duplicate auth-client lock waits.
 *
 * Returns null on timeout rather than throwing, so callers can fall through
 * to recovery without try/catch boilerplate.
 */
let _sessionPromise: Promise<Awaited<ReturnType<SupabaseClient["auth"]["getSession"]>>> | null = null;
let _lastSessionSource: string | null = null;

function coordinatedGetSession(
  source: string,
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["getSession"]>>> {
  if (_sessionPromise) {
    logConnectionEvent({
      type: "api_ok",
      detail: `getSession-deduplicated: ${source} joined in-flight session check from ${_lastSessionSource}`,
    });
    return _sessionPromise;
  }

  _lastSessionSource = source;
  const client = createClient();
  _sessionPromise = client.auth.getSession().finally(() => {
    _sessionPromise = null;
    _lastSessionSource = null;
  });
  return _sessionPromise;
}

export async function getSessionWithTimeout(source: string): Promise<{
  session: Session | null;
  timedOut: boolean;
}> {
  try {
    const { data: { session } } = await withAuthOpTimeout(
      `getSession:${source}`,
      coordinatedGetSession(source),
    );
    return { session: session ?? null, timedOut: false };
  } catch (error) {
    const isTimeout = (error as Error & { isAuthOpTimeout?: boolean })?.isAuthOpTimeout === true;
    if (isTimeout) {
      void coordinatedRefreshSession(`getSession-timeout:${source}`).catch((refreshError) => {
        logConnectionEvent({
          type: "token_refresh_fail",
          detail: `getSession timeout refresh failed (${source}): ${
            refreshError instanceof Error ? refreshError.message : String(refreshError)
          }`,
        });
      });
    }
    if (!isTimeout) {
      // Non-timeout errors are unusual but possible — log and treat as null session
      logConnectionEvent({
        type: "api_error",
        detail: `getSessionWithTimeout exception (${source}): ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return { session: null, timedOut: isTimeout };
  }
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
