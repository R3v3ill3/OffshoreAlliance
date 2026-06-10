import { createBrowserClient } from "@supabase/ssr";
// processLock is re-exported by supabase-js from auth-js. Importing from
// supabase-js avoids declaring a direct auth-js dependency.
import { processLock, type SupabaseClient, type Session } from "@supabase/supabase-js";
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

/**
 * Acquire-wait / hold thresholds above which we record a `lock_contended`
 * diagnostic. These give early visibility into auth-lock pressure BEFORE it
 * escalates into a full deadlock (lock_timeout), which the navigator.locks
 * shim in diagnostics-shim.ts cannot see now that we use processLock.
 */
const LOCK_ACQUIRE_WARN_MS = 2_000;
const LOCK_HELD_WARN_MS = 5_000;

/**
 * Ceiling on how long ANY auth operation may wait to ACQUIRE the auth lock.
 *
 * auth-js calls most public methods with `acquireTimeout = -1` (wait forever),
 * and `processLock`'s queue is MODULE-GLOBAL (keyed by lock name) — it
 * survives `resetClient()`. So one wedged holder (e.g. getSession's in-line
 * token refresh stalling on a post-wake cold network) silently blocks every
 * subsequent auth op AND every data query (supabase-js `_getAccessToken` →
 * `getSession()` → this lock) with NO timeout and NO error: the classic
 * "infinite loading spinner with nothing in the console".
 *
 * Clamping the acquire wait converts that silent hang into a
 * ProcessLockAcquireTimeoutError (`isAcquireTimeout`), which every consumer
 * already handles: queries route through isLikelyAuthError → server refresh →
 * retry; getSessionWithTimeout returns timedOut → recovery ladder; login
 * resets and retries. The holder itself is bounded by the 20s fetch timeout,
 * so waiters clamped at 15s recover shortly after the holder clears.
 */
const LOCK_ACQUIRE_MAX_WAIT_MS = 15_000;

/**
 * Zero-await instrumentation wrapper around processLock.
 *
 * RESPONSIVENESS CONSTRAINT: this must NOT add any awaits, timers, or work to
 * the hot path of lock acquisition. It only records timestamps and emits a
 * diagnostic when a lock is slow to acquire or held a long time. The lock the
 * Supabase auth client uses is `lock:<storageKey>`; auth-js calls this for
 * getSession / getUser / refreshSession / signOut, so wrapping the single
 * `lock` function we pass covers every auth operation.
 */
function instrumentedLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const requestedAt = Date.now();
  const wrappedFn = (): Promise<R> => {
    const acquiredAt = Date.now();
    const acquireWaitMs = acquiredAt - requestedAt;
    if (acquireWaitMs >= LOCK_ACQUIRE_WARN_MS) {
      logConnectionEvent({
        type: "lock_contended",
        detail: `acquire wait ${acquireWaitMs}ms: ${name}`,
        durationMs: acquireWaitMs,
      });
    }
    return Promise.resolve(fn()).finally(() => {
      const heldMs = Date.now() - acquiredAt;
      if (heldMs >= LOCK_HELD_WARN_MS) {
        logConnectionEvent({
          type: "lock_contended",
          detail: `held ${heldMs}ms: ${name}`,
          durationMs: heldMs,
        });
      }
    });
  };
  // Clamp infinite waits (see LOCK_ACQUIRE_MAX_WAIT_MS above). Non-negative
  // timeouts requested by auth-js are preserved as-is.
  const boundedAcquireTimeout = acquireTimeout < 0 ? LOCK_ACQUIRE_MAX_WAIT_MS : acquireTimeout;
  return processLock(name, boundedAcquireTimeout, wrappedFn);
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
        // (visibility handler, heartbeat, middleware), and when it consumes a
        // refresh token that was already rotated by the middleware, it triggers
        // an unrecoverable "Invalid Refresh Token: Already Used" error that
        // corrupts the auth state.
        //
        // SINGLE-WRITER MODEL: the client NEVER rotates tokens. Refresh is
        // handled exclusively server-side by:
        // 1. Middleware (on every page navigation)
        // 2. POST /api/auth/refresh via refreshSessionViaServer() (visibility
        //    handler, heartbeat, pre-mutation guard, recovery ladder)
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
        //   - The client never rotates tokens (single-writer model), so there
        //     is no cross-tab refresh race to serialize.
        //
        // See plan: cuddly-herding-acorn.md (Workstream A).
        // Source: node_modules/@supabase/auth-js/src/lib/locks.ts (processLock).
        //
        // Wrapped with instrumentedLock for diagnostics (acquire-wait / hold
        // time). The wrapper is a zero-await pass-through — it adds no latency
        // to the lock path, only telemetry.
        lock: instrumentedLock,
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
 * True when an error represents an auth-LOCK timeout — i.e. the in-tab auth
 * lock is jammed, NOT a confirmed session loss. Callers must route these into
 * the reset-then-reload recovery ladder and must NEVER force-logout on them.
 *
 * Two flavours, both meaning "the lock is stuck":
 *   1. `isAuthOpTimeout` — our own withAuthOpTimeout wrapper (12 s) fired. This
 *      is the re-entrant path in auth-js `_acquireLock`: the lock was already
 *      held, so the queued op waited on a sibling that never resolved (the
 *      re-entrant path has NO timeout of its own — our wrapper is the ceiling).
 *   2. `isAcquireTimeout` — auth-js's `ProcessLockAcquireTimeoutError` (5 s,
 *      message "Acquiring process lock … timed out"). A previous auth op is
 *      still holding/queued in processLock, so this op could not ACQUIRE the
 *      lock. This is the flavour Safari predominantly hits (background timer
 *      throttling / ITP / Private Relay can orphan the first op). auth-js
 *      documents detecting it via the `isAcquireTimeout` property — NOT
 *      `instanceof` (the error subclasses don't set a custom `name`).
 */
export function isAuthLockTimeout(error: unknown): boolean {
  const e = error as { isAuthOpTimeout?: boolean; isAcquireTimeout?: boolean } | null | undefined;
  return e?.isAuthOpTimeout === true || e?.isAcquireTimeout === true;
}

/**
 * Known access-token expiry (ms since epoch), updated whenever we learn it
 * from a session or a server refresh. Lets the heartbeat / visibility handlers
 * decide CHEAPLY whether a refresh is needed WITHOUT calling the client's
 * getSession() — which is itself the thing that hangs (it fires an in-line
 * network token refresh when the token is within 90s of expiry; after a wake
 * that refresh stalls and produces the lock_timeout cascade).
 */
let _knownExpiresAtMs: number | null = null;

export function setKnownExpiry(expiresAtSeconds: number | null | undefined): void {
  _knownExpiresAtMs = expiresAtSeconds ? expiresAtSeconds * 1000 : null;
}

export function getKnownExpiryMs(): number | null {
  return _knownExpiresAtMs;
}

/**
 * How long to wait for the server refresh round-trip before giving up. Kept
 * well under SUPABASE_AUTH_OP_TIMEOUT_MS so a slow server path fails over to a
 * retry/soft-reload fast instead of the old 12s + 12s stall.
 */
const SERVER_REFRESH_TIMEOUT_MS = 8_000;

export type ServerRefreshReason =
  | "ok"
  | "no_session"
  | "error"
  | "timeout"
  | "network"
  | "http"
  | "exception";

export interface ServerRefreshResult {
  ok: boolean;
  expiresAt: number | null;
  reason: ServerRefreshReason;
}

/**
 * Refresh the Supabase session via the SERVER (/api/auth/refresh), which runs
 * the cookie-based refresh through @supabase/ssr.
 *
 * This is the RELIABLE refresh path. The server↔Supabase network stays warm
 * even when the CLIENT's own refresh hangs (right after the laptop wakes /
 * Wi-Fi reconnects, which is when getSession()'s in-line refresh stalls and
 * produces the lock_timeout cascade). On success the browser cookie holds a
 * fresh token, so the client's next getSession()/query reads it WITHOUT a
 * network refresh.
 *
 * Never throws — returns a tagged result so callers can branch:
 *   ok          → token refreshed; cookie updated; invalidate queries.
 *   no_session  → server confirms no session (genuine logout candidate).
 *   timeout/... → transient; do NOT log out, retry on next tick.
 */
// Dedupe concurrent server refreshes: visibility handler, heartbeat, focus
// gate, query-cache recovery, and mutation guards can all fire around the same
// wake-up moment. One POST serves them all (and avoids back-to-back rotations).
let _serverRefreshInFlight: Promise<ServerRefreshResult> | null = null;

export function refreshSessionViaServer(
  source: string,
  timeoutMs: number = SERVER_REFRESH_TIMEOUT_MS,
): Promise<ServerRefreshResult> {
  if (_serverRefreshInFlight) return _serverRefreshInFlight;
  const promise = doRefreshSessionViaServer(source, timeoutMs).finally(() => {
    if (_serverRefreshInFlight === promise) _serverRefreshInFlight = null;
  });
  _serverRefreshInFlight = promise;
  return promise;
}

async function doRefreshSessionViaServer(
  source: string,
  timeoutMs: number,
): Promise<ServerRefreshResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/auth/refresh?src=${encodeURIComponent(source)}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, expiresAt: null, reason: "http" };
    }
    const json = (await res.json()) as {
      ok?: boolean;
      expiresAt?: number | null;
      reason?: ServerRefreshReason;
    };
    if (json?.expiresAt) setKnownExpiry(json.expiresAt);
    if (json?.ok) {
      return { ok: true, expiresAt: json.expiresAt ?? null, reason: "ok" };
    }
    return {
      ok: false,
      expiresAt: json?.expiresAt ?? null,
      reason: json?.reason ?? "error",
    };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    return { ok: false, expiresAt: null, reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shared getSession() with a 12-second timeout.
 *
 * Multiple callers can fire close together (e.g. recovery + auth-context).
 * Reuse one in-flight getSession() call so they don't cascade into duplicate
 * auth-client lock waits.
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
  const promise = client.auth.getSession();
  _sessionPromise = promise;

  // Unpin when the call settles, OR after the auth-op budget if it never does.
  //
  // CRITICAL: without the timeout-based unpin, a deadlocked getSession() (the
  // auth-js re-entrant lock path waits forever) leaves `_sessionPromise` pinned
  // to a dead promise, so every later caller dedups onto a corpse and can never
  // issue a fresh call — even after resetClient(). The guard (`=== promise`)
  // ensures we never clear a newer in-flight promise.
  const unpin = () => {
    if (_sessionPromise === promise) {
      _sessionPromise = null;
      _lastSessionSource = null;
    }
  };
  promise.then(unpin, unpin);
  setTimeout(unpin, SUPABASE_AUTH_OP_TIMEOUT_MS);

  return promise;
}

export async function getSessionWithTimeout(
  source: string,
  timeoutMs: number = SUPABASE_AUTH_OP_TIMEOUT_MS,
): Promise<{
  session: Session | null;
  timedOut: boolean;
}> {
  try {
    const { data: { session } } = await withAuthOpTimeout(
      `getSession:${source}`,
      coordinatedGetSession(source),
      timeoutMs,
    );
    return { session: session ?? null, timedOut: false };
  } catch (error) {
    const isAuthOpTimeout = (error as Error & { isAuthOpTimeout?: boolean })?.isAuthOpTimeout === true;
    const isAcquireTimeout = (error as Error & { isAcquireTimeout?: boolean })?.isAcquireTimeout === true;
    // Either flavour means the auth lock is jammed (see isAuthLockTimeout). We
    // return timedOut:true for BOTH so callers route into the recovery ladder
    // and never mistake a jammed lock for a null session / force-logout.
    const isLockTimeout = isAuthOpTimeout || isAcquireTimeout;

    if (isAuthOpTimeout) {
      // The lock was HELD but the op under it ran long — usually getSession's
      // in-line client refresh stalling (H8). Refresh via the SERVER (the
      // reliable cookie path): once the cookie holds a fresh token, the next
      // getSession returns locally without a network refresh. withAuthOpTimeout
      // already logged the lock_timeout event for this flavour.
      void refreshSessionViaServer(`getSession-timeout:${source}`).then((result) => {
        if (result.ok) {
          logConnectionEvent({
            type: "token_refresh_ok",
            detail: `server refresh after getSession timeout (${source})`,
          });
        } else {
          logConnectionEvent({
            type: "token_refresh_fail",
            detail: `server refresh after getSession timeout failed (${source}): ${result.reason}`,
          });
        }
      });
    } else if (isAcquireTimeout) {
      // processLock could not ACQUIRE the lock — a previous auth op is still
      // holding/queued (deadlocked). Do NOT fire a refresh: it would queue
      // behind the same jammed lock and also time out. Record a lock_timeout
      // (nothing else logged one for this flavour — withAuthOpTimeout's timer
      // never fired because the underlying call rejected first) so the caller's
      // reset-then-reload ladder can engage.
      logConnectionEvent({
        type: "lock_timeout",
        detail: `processLock acquire timeout (${source}): ${error instanceof Error ? error.message : String(error)}`,
      });
    } else {
      // Genuinely unexpected error — log and treat as null session.
      logConnectionEvent({
        type: "api_error",
        detail: `getSessionWithTimeout exception (${source}): ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return { session: null, timedOut: isLockTimeout };
  }
}

export function resetClient(): void {
  _client = undefined;
  // Drop any pinned in-flight promise too. A new client instance has a fresh
  // `lockAcquired` flag, but if we kept the old (possibly deadlocked) promise
  // here, coordinatedGetSession would keep handing the stuck promise back
  // instead of issuing a fresh call against the new client.
  _sessionPromise = null;
  _lastSessionSource = null;
}

// NOTE: there is deliberately NO client-side refreshSession() helper any more.
// The client never rotates tokens (single-writer model — see the
// autoRefreshToken comment above). All refresh goes through the middleware or
// refreshSessionViaServer(); rotating client-side risks both the
// "Invalid Refresh Token: Already Used" race and the post-wake network stall
// (H8) that produced the lock_timeout cascades.
