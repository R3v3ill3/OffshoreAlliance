import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetClient } from "@/lib/supabase/client";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";

type RecoverySource = "menu-hard-refresh" | "query-cache-auth-error" | "auth-change" | "manual";
type FailureReason =
  | "session_check_timeout"
  | "session_check_error"
  | "missing_session"
  | "probe_timeout"
  | "probe_error"
  | "workload_probe_error";

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
 * Intentionally narrow to avoid false-positive recovery cascades
 * from schema errors (400), missing tables (404), or network noise.
 */
export function isLikelyAuthError(error: unknown): boolean {
  const status = readErrorStatus(error);
  if (status === 401 || status === 403) return true;

  const code = readErrorCode(error)?.toUpperCase();
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

function clearSupabaseLocalState(): void {
  resetClient();
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

function goToLogin(reasonCode: string): void {
  logConnectionEvent({ type: "session_lost", detail: reasonCode });
  const nextUrl = `/login?reason=${encodeURIComponent(reasonCode)}`;
  window.location.href = nextUrl;
}

async function hardFailRecovery(
  queryClient: QueryClient,
  reason: FailureReason,
  message: string,
  redirectOnFailure: boolean
): Promise<SessionRecoveryResult> {
  logConnectionEvent({ type: "session_lost", detail: `${reason}: ${message}` });

  await queryClient.cancelQueries();
  queryClient.clear();
  clearSupabaseLocalState();

  if (redirectOnFailure) {
    const shouldRedirect =
      reason === "session_check_timeout" ||
      reason === "session_check_error" ||
      reason === "missing_session";
    if (!shouldRedirect) {
      return { ok: false, message, reasonCode: reason, redirectedToLogin: false };
    }
    goToLogin(reason);
    return { ok: false, message, reasonCode: reason, redirectedToLogin: true };
  }

  return { ok: false, message, reasonCode: reason, redirectedToLogin: false };
}

function softFailRecovery(
  reason: FailureReason,
  message: string
): SessionRecoveryResult {
  console.warn("[session-recovery] Non-destructive recovery failure", { reason, message });
  logConnectionEvent({ type: "api_error", detail: `soft-fail: ${reason} — ${message}` });
  return { ok: false, message, reasonCode: reason, redirectedToLogin: false };
}

/**
 * Graduated session recovery:
 * 1. Try refreshing the session (soft)
 * 2. Invalidate queries
 * 3. Only clear storage + redirect if session is truly gone
 */
export async function recoverSessionConnection({
  supabase,
  queryClient,
  source,
  reloadOnSuccess = true,
  redirectOnFailure = true,
  validateWorkloadAccess = false,
}: RecoverSessionOptions): Promise<SessionRecoveryResult> {
  logConnectionEvent({ type: "session_recovered", detail: `recovery-start: ${source}` });

  // Step 1: Try refreshing the session first (graduated approach)
  if (source === "query-cache-auth-error") {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.refreshSession(),
        8000,
        new Error("Timed out refreshing session")
      );
      if (!error && data.session) {
        logConnectionEvent({ type: "token_refresh_ok", detail: "refreshed via recovery" });
        await queryClient.invalidateQueries();
        return {
          ok: true,
          message: "Session refreshed successfully.",
          reasonCode: "refreshed",
          redirectedToLogin: false,
        };
      }
    } catch {
      // Fall through to full recovery
    }
  }

  // Step 2: Check session state
  let sessionResult: Awaited<ReturnType<typeof supabase.auth.getSession>>;
  try {
    sessionResult = await withTimeout(
      supabase.auth.getSession(),
      8000,
      new Error("Timed out while checking Supabase session")
    );
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.message.includes("Timed out")
        ? "session_check_timeout"
        : "session_check_error";
    return hardFailRecovery(queryClient, reason, readErrorMessage(error), redirectOnFailure);
  }

  if (sessionResult.error) {
    return hardFailRecovery(
      queryClient,
      "session_check_error",
      sessionResult.error.message,
      redirectOnFailure
    );
  }

  const session = sessionResult.data.session;
  const user = session?.user ?? null;
  if (!user) {
    return hardFailRecovery(
      queryClient,
      "missing_session",
      "No active session found. Redirecting to login.",
      redirectOnFailure
    );
  }

  // Step 3: Probe DB connectivity
  const probeStartedAt = Date.now();
  try {
    const probeResult = await withTimeout(
      supabase.from("user_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
      8000,
      new Error("Timed out while validating database connection")
    );
    if (probeResult.error) {
      return softFailRecovery("probe_error", buildErrorSummary(probeResult.error));
    }
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.message.includes("Timed out")
        ? "probe_timeout"
        : "probe_error";
    return softFailRecovery(reason, readErrorMessage(error));
  }

  // Step 4: Optional workload probe
  if (validateWorkloadAccess) {
    const workloadProbeResult = await supabase.rpc("get_workload_dashboard_data", {
      p_filter_organiser: null,
      p_filter_status: null,
      p_filter_days: null,
    });
    if (workloadProbeResult.error) {
      return softFailRecovery("workload_probe_error", buildErrorSummary(workloadProbeResult.error));
    }
  }

  await queryClient.invalidateQueries();
  logConnectionEvent({
    type: "session_recovered",
    detail: `recovery-success: ${source}`,
    durationMs: Date.now() - probeStartedAt,
  });

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
      new Error("Timed out while signing out")
    );
    if (error) {
      console.warn("[session-recovery] signOut error", error.message);
    }
  } catch (error: unknown) {
    console.warn("[session-recovery] signOut exception", readErrorMessage(error));
  }

  clearSupabaseLocalState();
  goToLogin("signed_out");
}
