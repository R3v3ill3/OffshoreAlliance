import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetClient, coordinatedRefreshSession } from "@/lib/supabase/client";
import { logConnectionEvent, generateTraceId } from "@/lib/supabase/connection-monitor";

type RecoverySource = "menu-hard-refresh" | "query-cache-auth-error" | "auth-change" | "manual";
type FailureReason =
  | "session_check_timeout"
  | "session_check_error"
  | "missing_session"
  | "probe_timeout"
  | "probe_error"
  | "workload_probe_error"
  | "circuit_breaker";

export interface SessionRecoveryResult {
  ok: boolean;
  message: string;
  reasonCode: string;
  redirectedToLogin: boolean;
}

interface RecoverSessionOptions {
  supabase: SupabaseClient;
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

/**
 * Flag set during intentional sign-out to prevent the onAuthStateChange
 * SIGNED_OUT handler from triggering another recovery.
 */
let _intentionalSignOut = false;
export function isIntentionalSignOut(): boolean {
  return _intentionalSignOut;
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
 */
export function isLikelyAuthError(error: unknown): boolean {
  const status = readErrorStatus(error);
  const code = readErrorCode(error)?.toUpperCase();

  if (status === 401) return true;

  if (status === 403 && code && ["PGRST301", "INVALID_JWT"].includes(code)) return true;

  if (code && ["PGRST301", "INVALID_JWT"].includes(code)) return true;

  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes("jwt expired") ||
    message.includes("jwt malformed") ||
    message.includes("not authenticated") ||
    message.includes("invalid refresh token") ||
    message.includes("session_not_found")
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
 * Graduated session recovery with circuit breaker:
 * 1. Check circuit breaker to prevent cascading recoveries
 * 2. Try a coordinated token refresh (mutex-protected)
 * 3. Verify session via getSession
 * 4. Probe DB connectivity
 * 5. Only redirect to login if session is confirmed missing after refresh attempt
 */
export async function recoverSessionConnection({
  supabase,
  queryClient,
  source,
  reloadOnSuccess = true,
  redirectOnFailure = true,
  validateWorkloadAccess = false,
}: RecoverSessionOptions): Promise<SessionRecoveryResult> {
  const traceId = generateTraceId();
  const now = Date.now();

  // Circuit breaker: skip if recovery was attempted very recently.
  // Exception: menu-initiated hard refresh always bypasses the breaker so the
  // user is never silently trapped on a broken page.
  const isBypassSource = source === "menu-hard-refresh";
  if (!isBypassSource && now - _lastRecoveryAttemptTs < CIRCUIT_BREAKER_WINDOW_MS) {
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
  logConnectionEvent({ type: "recovery_start", detail: `${source}`, traceId });

  // Step 1: Always try a coordinated token refresh first
  try {
    const { data, error } = await withTimeout(
      coordinatedRefreshSession(`recovery:${source}`),
      12_000,
      new Error("Timed out refreshing session"),
    );
    if (!error && data.session) {
      logConnectionEvent({ type: "token_refresh_ok", detail: `refreshed via recovery: ${source}`, traceId });
      await queryClient.invalidateQueries();
      logConnectionEvent({ type: "recovery_end", detail: `success after refresh: ${source}`, traceId });

      if (reloadOnSuccess) {
        window.location.reload();
      }

      return {
        ok: true,
        message: "Session refreshed successfully.",
        reasonCode: "refreshed",
        redirectedToLogin: false,
      };
    }
  } catch {
    // Fall through to session check
  }

  // Step 2: Check session state (with generous timeout)
  let sessionResult: Awaited<ReturnType<typeof supabase.auth.getSession>>;
  try {
    sessionResult = await withTimeout(
      supabase.auth.getSession(),
      15_000,
      new Error("Timed out while checking Supabase session"),
    );
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.message.includes("Timed out")
        ? "session_check_timeout"
        : "session_check_error";
    logConnectionEvent({ type: "recovery_end", detail: `fail: ${reason}`, traceId });
    return hardFailRecovery(queryClient, reason, readErrorMessage(error), redirectOnFailure, traceId);
  }

  if (sessionResult.error) {
    logConnectionEvent({ type: "recovery_end", detail: `fail: session error`, traceId });
    return hardFailRecovery(
      queryClient,
      "session_check_error",
      sessionResult.error.message,
      redirectOnFailure,
      traceId,
    );
  }

  const session = sessionResult.data.session;
  const user = session?.user ?? null;

  if (!user) {
    logConnectionEvent({ type: "recovery_end", detail: `fail: missing session`, traceId });
    return hardFailRecovery(
      queryClient,
      "missing_session",
      "No active session found. Redirecting to login.",
      redirectOnFailure,
      traceId,
    );
  }

  // Step 3: Probe DB connectivity
  const probeStartedAt = Date.now();
  try {
    const probeResult = await withTimeout(
      supabase.from("user_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
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
      return softFailRecovery("probe_error", buildErrorSummary(probeResult.error), traceId);
    }
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.message.includes("Timed out")
        ? "probe_timeout"
        : "probe_error";
    logConnectionEvent({ type: "recovery_end", detail: `soft-fail: ${reason}`, traceId });
    return softFailRecovery(reason, readErrorMessage(error), traceId);
  }

  // Step 4: Optional workload probe
  if (validateWorkloadAccess) {
    const workloadProbeResult = await supabase.rpc("get_workload_dashboard_data", {
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
