import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { agentDebugLog } from "@/lib/agent-debug-log";
import { resetClient } from "@/lib/supabase/client";

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

export function isLikelyAuthError(error: unknown): boolean {
  const status = readErrorStatus(error);
  if (status === 401 || status === 403) return true;

  const code = readErrorCode(error)?.toUpperCase();
  if (code && ["PGRST301", "401", "403", "INVALID_JWT"].includes(code)) return true;

  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes("jwt") ||
    message.includes("not authenticated") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("token")
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
  agentDebugLog({
    location: "session-recovery.ts:go-to-login",
    message: "Navigating to login",
    data: { reasonCode },
    hypothesisId: "H6",
  });
  const nextUrl = `/login?reason=${encodeURIComponent(reasonCode)}`;
  window.location.href = nextUrl;
}

/** Session/auth problems only: clear caches and Supabase browser storage. */
async function hardFailRecovery(
  queryClient: QueryClient,
  reason: FailureReason,
  message: string,
  redirectOnFailure: boolean
): Promise<SessionRecoveryResult> {
  agentDebugLog({
    location: "session-recovery.ts:recover-fail-hard",
    message: "Session recovery failed (destructive)",
    data: { reason, message, redirectOnFailure, willClearStorage: true },
    hypothesisId: "H6",
  });
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

/** DB/RPC issues: do not wipe sb-* storage or clear all queries (avoids breaking the SPA). */
function softFailRecovery(
  reason: FailureReason,
  message: string
): SessionRecoveryResult {
  console.error("[session-recovery] Non-destructive recovery failure", {
    reason,
    message,
    willClearStorage: false,
  });
  agentDebugLog({
    location: "session-recovery.ts:recover-fail-soft",
    message: "Session recovery failed (non-destructive)",
    data: { reason, message, willClearStorage: false },
    hypothesisId: "H6",
  });
  if (reason === "workload_probe_error") {
    console.error(
      "[session-recovery] Workload RPC probe failed; session was not cleared. Fix DB/RPC or use validateWorkloadAccess: false."
    );
  }
  return { ok: false, message, reasonCode: reason, redirectedToLogin: false };
}

export async function recoverSessionConnection({
  supabase,
  queryClient,
  source,
  reloadOnSuccess = true,
  redirectOnFailure = true,
  validateWorkloadAccess = false,
}: RecoverSessionOptions): Promise<SessionRecoveryResult> {
  agentDebugLog({
    location: "session-recovery.ts:recover-start",
    message: "Starting hard session recovery",
    data: { source },
    hypothesisId: "H6",
  });

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
    return hardFailRecovery(
      queryClient,
      reason,
      readErrorMessage(error),
      redirectOnFailure
    );
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

  const probeStartedAt = Date.now();
  const probe = withTimeout(
    supabase.from("user_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
    8000,
    new Error("Timed out while validating database connection")
  );

  let probeResult: Awaited<typeof probe>;
  try {
    probeResult = await probe;
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.message.includes("Timed out")
        ? "probe_timeout"
        : "probe_error";
    return softFailRecovery(reason, readErrorMessage(error));
  }

  if (probeResult.error) {
    return softFailRecovery(
      "probe_error",
      buildErrorSummary(probeResult.error)
    );
  }

  if (validateWorkloadAccess) {
    agentDebugLog({
      location: "session-recovery.ts:workload-probe-start",
      message: "Workload RPC probe (optional)",
      data: { source, validateWorkloadAccess },
      hypothesisId: "H6",
    });
    const workloadProbeResult = await supabase.rpc("get_workload_dashboard_data", {
      p_filter_organiser: null,
      p_filter_status: null,
      p_filter_days: null,
    });
    if (workloadProbeResult.error) {
      const summary = buildErrorSummary(workloadProbeResult.error);
      agentDebugLog({
        location: "session-recovery.ts:workload-probe-fail",
        message: "Workload RPC probe failed",
        data: { source, errorSummary: summary },
        hypothesisId: "H6",
      });
      return softFailRecovery("workload_probe_error", summary);
    }
    agentDebugLog({
      location: "session-recovery.ts:workload-probe-ok",
      message: "Workload RPC probe succeeded",
      data: { source },
      hypothesisId: "H6",
    });
  }

  await queryClient.invalidateQueries();
  agentDebugLog({
    location: "session-recovery.ts:recover-success",
    message: "Hard session recovery succeeded",
    data: { source, userId: user.id, probeDurationMs: Date.now() - probeStartedAt },
    hypothesisId: "H6",
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
  agentDebugLog({
    location: "session-recovery.ts:signout-start",
    message: "Starting robust sign out",
    data: { source },
    hypothesisId: "H6",
  });

  try {
    await queryClient.cancelQueries();
  } catch {
    // best effort
  }
  queryClient.clear();

  try {
    const signOutResult = await withTimeout(
      supabase.auth.signOut(),
      5000,
      new Error("Timed out while signing out")
    );
    const { error } = signOutResult;
    if (error) {
      agentDebugLog({
        location: "session-recovery.ts:signout-error",
        message: "Supabase signOut returned error",
        data: { source, errorMessage: error.message, errorCode: error.code ?? null },
        hypothesisId: "H6",
      });
    }
  } catch (error: unknown) {
    agentDebugLog({
      location: "session-recovery.ts:signout-exception",
      message: "Supabase signOut threw exception",
      data: { source, errorMessage: readErrorMessage(error) },
      hypothesisId: "H6",
    });
  }

  clearSupabaseLocalState();
  goToLogin("signed_out");
}
