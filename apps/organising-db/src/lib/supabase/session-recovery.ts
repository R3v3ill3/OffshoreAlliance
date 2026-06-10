import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createClient,
  resetClient,
  refreshSessionViaServer,
  getSessionWithTimeout,
} from "@/lib/supabase/client";
import { logConnectionEvent, generateTraceId } from "@/lib/supabase/connection-monitor";

type RecoverySource = "menu-hard-refresh" | "query-cache-auth-error" | "auth-change" | "manual";
type FailureReason =
  | "session_check_timeout"
  | "session_check_error"
  | "missing_session"
  | "refresh_transient"
  | "probe_timeout"
  | "probe_error"
  | "workload_probe_error"
  | "circuit_breaker"
  | "soft_reload";

export interface SessionRecoveryResult {
  ok: boolean;
  message: string;
  reasonCode: string;
  redirectedToLogin: boolean;
}

interface RecoverSessionOptions {
  queryClient: QueryClient;
  source: RecoverySource;
  reloadOnSuccess?: boolean;
  redirectOnFailure?: boolean;
  validateWorkloadAccess?: boolean;
}

interface SignOutOptions {
  supabase: SupabaseClient;
  queryClient: QueryClient;
  source?: string;
}

// Circuit breaker: prevent cascading recoveries within a short window
let _lastRecoveryAttemptTs = 0;
const CIRCUIT_BREAKER_WINDOW_MS = 30_000;
const TRANSIENT_FAILURE_WINDOW_MS = 2 * 60_000;
const TRANSIENT_FAILURE_ESCALATION_THRESHOLD = 3;
let _transientFailureStreak = 0;
let _lastTransientFailureTs = 0;

/**
 * Flag set during intentional sign-out to prevent the onAuthStateChange
 * SIGNED_OUT handler from triggering another recovery.
 */
let _intentionalSignOut = false;
export function isIntentionalSignOut(): boolean {
  return _intentionalSignOut;
}

function resetTransientFailureStreak(): void {
  _transientFailureStreak = 0;
  _lastTransientFailureTs = 0;
}

function shouldEscalateTransientFailure(): boolean {
  const now = Date.now();
  if (now - _lastTransientFailureTs > TRANSIENT_FAILURE_WINDOW_MS) {
    _transientFailureStreak = 0;
  }
  _transientFailureStreak += 1;
  _lastTransientFailureTs = now;
  return _transientFailureStreak >= TRANSIENT_FAILURE_ESCALATION_THRESHOLD;
}

function withTimeout<T>(promiseLike: PromiseLike<T>, timeoutMs: number, timeoutError: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(timeoutError), timeoutMs);
    Promise.resolve(promiseLike)
      .then((result) => {
        window.clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as Record<string, unknown>).status;
  return typeof status === "number" ? status : null;
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildErrorSummary(error: unknown): string {
  if (!error || typeof error !== "object") {
    return readErrorMessage(error);
  }

  const rec = error as Record<string, unknown>;
  const parts = [
    typeof rec.message === "string" ? rec.message : null,
    typeof rec.code === "string" ? `code=${rec.code}` : null,
    typeof rec.details === "string" ? `details=${rec.details}` : null,
    typeof rec.hint === "string" ? `hint=${rec.hint}` : null,
  ].filter(Boolean);
  return parts.join(" | ") || readErrorMessage(error);
}

/**
 * Determines whether an error is a genuine Supabase auth failure.
 * 403 alone is NOT sufficient -- RLS violations also return 403.
 * Only treat 403 as auth failure when accompanied by a known auth error code.
 *
 * Also treats lock-related errors as auth failures so the recovery flow can
 * trigger forceLogoutToLogin / nuclear reset rather than hang. These cover:
 *   - NavigatorLockAcquireTimeoutError / ProcessLockAcquireTimeoutError
 *     (auth-js's typed lock-timeout errors; both set isAcquireTimeout = true).
 *   - The raw Chromium DOMException "Lock broken by another request with the
 *     'steal' option" that surfaces if anything bypasses auth-js's
 *     v2.100 cascade guard (e.g. a third-party library or extension that
 *     uses the same lock name).
 *   - Our own withAuthOpTimeout sentinel (isAuthOpTimeout).
 */
export function isLikelyAuthError(error: unknown): boolean {
  const status = readErrorStatus(error);
  const code = readErrorCode(error)?.toUpperCase();

  if (status === 401) return true;

  if (status === 403 && code && ["PGRST301", "INVALID_JWT"].includes(code)) return true;

  if (code && ["PGRST301", "INVALID_JWT"].includes(code)) return true;

  // Lock / timeout sentinels (custom flags set by auth-js and our wrappers)
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    if (rec.isAcquireTimeout === true) return true;
    if (rec.isAuthOpTimeout === true) return true;
  }

  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes("jwt expired") ||
    message.includes("jwt malformed") ||
    message.includes("not authenticated") ||
    message.includes("invalid refresh token") ||
    message.includes("session_not_found") ||
    // Lock-related — see jsdoc above.
    message.includes("lock broken by another request") ||
    message.includes("released because another request stole it") ||
    message.includes("acquiring process lock") ||
    message.includes("acquiring navigator lock")
  );
}

function clearSupabaseLocalStorage(): void {
  if (typeof window === "undefined") return;

  try {
    const localKeys = Object.keys(window.localStorage);
    for (const key of localKeys) {
      if (key.startsWith("sb-")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // best effort
  }

  try {
    const sessionKeys = Object.keys(window.sessionStorage);
    for (const key of sessionKeys) {
      if (key.startsWith("sb-")) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // best effort
  }
}

function clearSupabaseBrowserState(): void {
  clearSupabaseCookies();
  clearSupabaseLocalStorage();
  resetClient();
}

/**
 * Explicitly clear all Supabase auth cookies from document.cookie.
 *
 * This is CRITICAL because supabase.auth.signOut() is the only other place
 * that clears cookies, and it goes through the auth client — which may be in
 * a broken/hung state (causing the 5-second timeout in performRobustSignOut
 * to fire without actually clearing cookies). When that happens, the stale
 * cookies persist, and any new Supabase client created after resetClient()
 * reads them and re-enters the same broken state.
 *
 * We expire cookies for both the explicit domain (.uconstruct.app) and
 * hostname-only variants to handle any domain mismatch scenarios.
 */
function clearSupabaseCookies(): void {
  if (typeof document === "undefined") return;

  try {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const name = cookie.split("=")[0]?.trim();
      if (!name || !name.startsWith("sb-")) continue;

      const expiry = "expires=Thu, 01 Jan 1970 00:00:00 GMT";

      // Clear with explicit domain (production)
      document.cookie = `${name}=; ${expiry}; path=/; domain=.uconstruct.app`;
      // Clear hostname-only (fallback / previews)
      document.cookie = `${name}=; ${expiry}; path=/`;
    }
  } catch {
    // best effort — cookie API shouldn't throw, but defensive
  }
}

function goToLogin(reasonCode: string): void {
  logConnectionEvent({ type: "session_lost", detail: reasonCode });
  const nextUrl = `/login?reason=${encodeURIComponent(reasonCode)}`;
  window.location.href = nextUrl;
}

export function forceLogoutToLogin(reasonCode: string): void {
  logConnectionEvent({ type: "session_lost", detail: `force-logout: ${reasonCode}` });
  clearSupabaseBrowserState();
  goToLogin(reasonCode);
}

/**
 * Terminal failure: session is confirmed gone. Clear cached data and, when
 * redirecting, clear browser auth state before sending the user to login.
 */
async function hardFailRecovery(
  queryClient: QueryClient,
  reason: FailureReason,
  message: string,
  redirectOnFailure: boolean,
  traceId: string,
): Promise<SessionRecoveryResult> {
  logConnectionEvent({ type: "session_lost", detail: `${reason}: ${message}`, traceId });

  try {
    await queryClient.cancelQueries();
  } catch {
    // best effort
  }
  queryClient.clear();

  if (redirectOnFailure) {
    forceLogoutToLogin(reason);
    return { ok: false, message, reasonCode: reason, redirectedToLogin: true };
  }

  return { ok: false, message, reasonCode: reason, redirectedToLogin: false };
}

function softFailRecovery(
  reason: FailureReason,
  message: string,
  traceId: string,
): SessionRecoveryResult {
  console.warn("[session-recovery] Non-destructive recovery failure", { reason, message, traceId });
  logConnectionEvent({ type: "api_error", detail: `soft-fail: ${reason} — ${message}`, traceId });
  return { ok: false, message, reasonCode: reason, redirectedToLogin: false };
}

/**
 * Soft reload that PRESERVES the auth cookies (no logout). Re-initialises the
 * whole JS context (fresh GoTrueClient, fresh sockets) and lets the middleware
 * refresh the session server-side on the reloaded request — the path that has
 * always recovered, including on Edge after sleeping-tab wakes.
 *
 * Guarded by a sessionStorage cooldown (shared with the providers.tsx
 * lock-deadlock ladder) so we never reload-loop.
 */
const SOFT_RELOAD_STORAGE_KEY = "oa:last-lock-deadlock-reload-at";
const SOFT_RELOAD_COOLDOWN_MS = 90_000;

function softReloadPreservingAuth(reason: string, traceId: string): SessionRecoveryResult {
  try {
    const previousRaw = window.sessionStorage.getItem(SOFT_RELOAD_STORAGE_KEY);
    const previous = previousRaw ? Number(previousRaw) : 0;
    if (Number.isFinite(previous) && previous > 0 && Date.now() - previous < SOFT_RELOAD_COOLDOWN_MS) {
      logConnectionEvent({
        type: "recovery_end",
        detail: `soft reload suppressed (cooldown): ${reason}`,
        traceId,
      });
      return {
        ok: false,
        message:
          "Still reconnecting. Please wait a few seconds and try again — you do not need to sign out.",
        reasonCode: "soft_reload",
        redirectedToLogin: false,
      };
    }
    window.sessionStorage.setItem(SOFT_RELOAD_STORAGE_KEY, String(Date.now()));
  } catch {
    // best effort
  }
  logConnectionEvent({
    type: "recovery_end",
    detail: `soft reload (cookies preserved, no logout): ${reason}`,
    traceId,
  });
  window.location.reload();
  return {
    ok: true,
    message: "Reloading to restore the connection…",
    reasonCode: "soft_reload",
    redirectedToLogin: false,
  };
}

/**
 * Graduated session recovery, SERVER-FIRST, with circuit breaker:
 * 1. Check circuit breaker to prevent cascading recoveries.
 * 2. Refresh the session via the SERVER (/api/auth/refresh) — the reliable
 *    cookie path. The client-side refreshSession()/getSession() pipeline this
 *    used to call is exactly what hangs after a tab wake (H8), which made the
 *    "Refresh connection" button itself fail with session_check_timeout.
 * 3. On success, drop the (possibly wedged) browser client and verify the
 *    fresh client can read the session locally, then probe DB connectivity.
 * 4. Only redirect to login when the SERVER confirms there is no session.
 * 5. For user-initiated recovery, transient failures escalate to a soft
 *    reload (cookies preserved — no logout) instead of stranding the user.
 */
export async function recoverSessionConnection({
  queryClient,
  source,
  reloadOnSuccess = true,
  redirectOnFailure = true,
  validateWorkloadAccess = false,
}: RecoverSessionOptions): Promise<SessionRecoveryResult> {
  const traceId = generateTraceId();
  const now = Date.now();

  // User explicitly asked for recovery (menu / banner button). These flows may
  // escalate to a soft reload on transient failure rather than soft-failing.
  const isUserInitiated = source === "menu-hard-refresh" || source === "manual";

  // Circuit breaker: skip if recovery was attempted very recently.
  // Exception: menu-initiated hard refresh always bypasses the breaker so the
  // user is never silently trapped on a broken page.
  if (!isUserInitiated && now - _lastRecoveryAttemptTs < CIRCUIT_BREAKER_WINDOW_MS) {
    const elapsed = now - _lastRecoveryAttemptTs;
    logConnectionEvent({
      type: "recovery_start",
      detail: `circuit-breaker: skipped recovery from ${source} (${elapsed}ms since last attempt)`,
      traceId,
    });
    // If the caller explicitly asked to redirect on failure, still honour that even
    // when the circuit breaker fires — being stuck on a blank page is worse than
    // an extra redirect.
    if (redirectOnFailure) {
      forceLogoutToLogin("circuit_breaker");
      return { ok: false, message: "Circuit breaker active — redirecting to login.", reasonCode: "circuit_breaker", redirectedToLogin: true };
    }
    return {
      ok: false,
      message: `Recovery skipped (circuit breaker, ${Math.round(elapsed / 1000)}s since last attempt).`,
      reasonCode: "circuit_breaker",
      redirectedToLogin: false,
    };
  }

  _lastRecoveryAttemptTs = now;
  logConnectionEvent({ type: "recovery_start", detail: `${source} (server-first)`, traceId });

  // Step 1: Server-side cookie refresh — the reliable path (bounded at 8s,
  // never throws). After it returns ok, the browser cookie holds a fresh
  // token, so the client needs NO network refresh.
  const serverResult = await refreshSessionViaServer(`recovery:${source}`);

  if (serverResult.reason === "no_session") {
    // The SERVER confirms there is no session — genuine logout.
    logConnectionEvent({ type: "recovery_end", detail: `fail: server reports no session`, traceId });
    return hardFailRecovery(
      queryClient,
      "missing_session",
      "No active session found. Redirecting to login.",
      redirectOnFailure,
      traceId,
    );
  }

  if (!serverResult.ok) {
    // Transient (timeout / network / http / exception) — NOT a confirmed
    // session loss. Never force-logout on these.
    logConnectionEvent({
      type: "recovery_end",
      detail: `fail: server refresh transient (${serverResult.reason})`,
      traceId,
    });
    if (isUserInitiated) {
      // The user is looking at a broken page and asked us to fix it. A soft
      // reload re-establishes sockets and lets the middleware refresh the
      // cookie — the path that has always recovered.
      return softReloadPreservingAuth(`server refresh ${serverResult.reason} (${source})`, traceId);
    }
    const escalate = shouldEscalateTransientFailure();
    if (redirectOnFailure && escalate) {
      return hardFailRecovery(
        queryClient,
        "refresh_transient",
        `Server refresh failed (${serverResult.reason}) repeatedly — escalated.`,
        true,
        traceId,
      );
    }
    return softFailRecovery(
      "refresh_transient",
      `Server refresh failed (${serverResult.reason}); transient, will retry on next trigger.`,
      traceId,
    );
  }

  logConnectionEvent({ type: "token_refresh_ok", detail: `server refresh via recovery: ${source}`, traceId });

  // Step 2: Drop the possibly-wedged browser client and verify the fresh one
  // can read the (now fresh) session locally. With a fresh token this is a
  // local cookie read — no network refresh. BUT: auth-js's processLock queue
  // is module-global, so if a wedged op from before the reset still HOLDS the
  // lock, even the fresh client queues behind it. Use a short 5s budget — a
  // healthy read is instant, and when the global lock is jammed only a reload
  // clears it, so fail over fast rather than waiting the full 12s.
  resetClient();
  const freshClient = createClient();
  const POST_REFRESH_SESSION_READ_TIMEOUT_MS = 5_000;
  const { session, timedOut } = await getSessionWithTimeout(
    `recovery:${source}`,
    POST_REFRESH_SESSION_READ_TIMEOUT_MS,
  );

  if (timedOut) {
    logConnectionEvent({ type: "recovery_end", detail: `fail: session_check_timeout (post-refresh)`, traceId });
    if (isUserInitiated) {
      return softReloadPreservingAuth(`post-refresh getSession timeout (${source})`, traceId);
    }
    const escalate = shouldEscalateTransientFailure();
    if (redirectOnFailure && escalate) {
      return hardFailRecovery(
        queryClient,
        "session_check_timeout",
        "Session check timed out repeatedly after server refresh — escalated.",
        true,
        traceId,
      );
    }
    return softFailRecovery(
      "session_check_timeout",
      "Session check timed out after server refresh (transient; will retry on next trigger).",
      traceId,
    );
  }

  if (!session) {
    logConnectionEvent({ type: "recovery_end", detail: `fail: missing session (post-refresh)`, traceId });
    return hardFailRecovery(
      queryClient,
      "missing_session",
      "No active session found. Redirecting to login.",
      redirectOnFailure,
      traceId,
    );
  }

  resetTransientFailureStreak();

  // Step 3: Probe DB connectivity (Lane 1) with the fresh client.
  const probeStartedAt = Date.now();
  try {
    const probeResult = await withTimeout(
      freshClient.from("user_profiles").select("user_id").eq("user_id", session.user.id).maybeSingle(),
      12_000,
      new Error("Timed out while validating database connection"),
    );
    if (probeResult.error) {
      // If the probe itself returns an auth error, the session is confirmed invalid — hard fail.
      // Non-auth probe failures (network blip, DB unreachable) remain soft failures.
      if (isLikelyAuthError(probeResult.error)) {
        logConnectionEvent({ type: "recovery_end", detail: `hard-fail: probe auth error`, traceId });
        return hardFailRecovery(queryClient, "probe_error", buildErrorSummary(probeResult.error), redirectOnFailure, traceId);
      }
      logConnectionEvent({ type: "recovery_end", detail: `soft-fail: probe error`, traceId });
      if (isUserInitiated) {
        return softReloadPreservingAuth(`probe error (${source})`, traceId);
      }
      return softFailRecovery("probe_error", buildErrorSummary(probeResult.error), traceId);
    }
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.message.includes("Timed out")
        ? "probe_timeout"
        : "probe_error";
    logConnectionEvent({ type: "recovery_end", detail: `soft-fail: ${reason}`, traceId });
    if (isUserInitiated) {
      // Session is valid (server confirmed) but Lane 1 is stalled — typical
      // Edge post-wake socket stall. A reload re-establishes the sockets.
      return softReloadPreservingAuth(`${reason} (${source})`, traceId);
    }
    return softFailRecovery(reason, readErrorMessage(error), traceId);
  }

  // Step 4: Optional workload probe
  if (validateWorkloadAccess) {
    const workloadProbeResult = await freshClient.rpc("get_workload_dashboard_data", {
      p_filter_organiser: null,
      p_filter_status: null,
      p_filter_days: null,
    });
    if (workloadProbeResult.error) {
      logConnectionEvent({ type: "recovery_end", detail: `soft-fail: workload probe`, traceId });
      return softFailRecovery("workload_probe_error", buildErrorSummary(workloadProbeResult.error), traceId);
    }
  }

  await queryClient.invalidateQueries();
  logConnectionEvent({
    type: "session_recovered",
    detail: `recovery-success: ${source}`,
    durationMs: Date.now() - probeStartedAt,
    traceId,
  });
  logConnectionEvent({ type: "recovery_end", detail: `success: ${source}`, traceId });

  if (reloadOnSuccess) {
    window.location.reload();
  }

  return {
    ok: true,
    message: "Connection refresh succeeded.",
    reasonCode: "ok",
    redirectedToLogin: false,
  };
}

export async function performRobustSignOut({
  supabase,
  queryClient,
  source = "manual",
}: SignOutOptions): Promise<void> {
  _intentionalSignOut = true;
  logConnectionEvent({ type: "session_lost", detail: `signout: ${source}` });

  try {
    await queryClient.cancelQueries();
  } catch {
    // best effort
  }
  queryClient.clear();

  try {
    const { error } = await withTimeout(
      supabase.auth.signOut(),
      5000,
      new Error("Timed out while signing out"),
    );
    if (error) {
      console.warn("[session-recovery] signOut error", error.message);
    }
  } catch (error: unknown) {
    console.warn("[session-recovery] signOut exception", readErrorMessage(error));
  }

  clearSupabaseBrowserState();
  goToLogin("signed_out");
}

/**
 * Nuclear reset: clears ALL Supabase state from the browser without going
 * through the auth client (which may be in a broken/hung state).
 *
 * This is the fallback when normal logout fails. It:
 * 1. Clears all sb-* cookies (both domain variants)
 * 2. Clears all sb-* localStorage and sessionStorage entries
 * 3. Resets the Supabase client singleton
 * 4. Attempts to release any held navigator.locks
 * 5. Navigates to /login
 *
 * This should always succeed because it does NOT call any Supabase client
 * methods — it operates directly on browser APIs.
 */
export function nuclearReset(): void {
  logConnectionEvent({ type: "session_lost", detail: "nuclear-reset" });

  // Clear cookies, web storage, and the client singleton before redirecting.
  clearSupabaseBrowserState();

  // 4. Best-effort: release any held navigator.locks.
  //    This uses the async query API but we don't await — fire and forget.
  if (typeof navigator !== "undefined" && navigator.locks) {
    try {
      navigator.locks.query().then((state) => {
        for (const lock of state.held ?? []) {
          if (lock.name?.includes("supabase")) {
            console.warn("[nuclear-reset] Found held Supabase lock:", lock.name);
            // navigator.locks doesn't support forced release from outside the holder.
            // Logging it is the best we can do; the page reload below will clear it.
          }
        }
      }).catch(() => {
        // best effort
      });
    } catch {
      // best effort
    }
  }

  // 5. Navigate to login. This also triggers a full page unload which
  //    releases any navigator.locks held by callbacks in this page.
  goToLogin("nuclear_reset");
}
