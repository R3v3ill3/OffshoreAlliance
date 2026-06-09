import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import { getKnownExpiryMs, refreshSessionViaServer } from "@/lib/supabase/client";
import { isLikelyAuthError } from "@/lib/supabase/session-recovery";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Pre-mutation session guard.
 *
 * Decides CHEAPLY whether the token needs refreshing using the in-memory
 * known expiry — NO client getSession() call. The old implementation called
 * getSessionWithTimeout + coordinatedRefreshSession (client-side network
 * refresh), which is exactly the path that hangs for 12s after a tab wake
 * (H8: `lock_timeout getSession:ensureValidSession`) and which rotated tokens
 * client-side in violation of the single-writer model.
 *
 * When a refresh is needed it goes through the SERVER (bounded at 8s, never
 * throws). Transient refresh failures do NOT block the mutation — a genuinely
 * dead session will surface as an auth error that the retry path handles.
 */
export async function ensureValidSession(): Promise<boolean> {
  const expMs = getKnownExpiryMs();
  if (expMs !== null && expMs - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return true; // token comfortably fresh — zero network, zero auth-lock pressure
  }

  logConnectionEvent({ type: "token_refresh_ok", detail: "preemptive server refresh before mutation" });
  const result = await refreshSessionViaServer("ensure-valid-session");
  if (result.ok) return true;
  if (result.reason === "no_session") return false;
  // Transient (timeout/network) — proceed; the mutation itself will surface a
  // real auth error if the session is actually gone.
  return true;
}

/**
 * Wraps useMutation with auth-awareness:
 * - Proactively refreshes the token before executing if it expires soon
 * - On auth errors, retries once after a coordinated refresh
 * - Does NOT trigger the global recovery cascade on failure
 */
export function useAuthAwareMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const originalMutationFn = options.mutationFn;

  return useMutation<TData, TError, TVariables, TContext>({
    ...options,
    mutationFn: originalMutationFn
      ? async (...args: Parameters<NonNullable<typeof originalMutationFn>>) => {
          await ensureValidSession();

          try {
            return await originalMutationFn(...args);
          } catch (error) {
            if (isLikelyAuthError(error)) {
              logConnectionEvent({ type: "token_refresh_fail", detail: "mutation auth error, retrying after server refresh" });
              const result = await refreshSessionViaServer("mutation-retry");
              if (!result.ok) throw error;
              return await originalMutationFn(...args);
            }
            throw error;
          }
        }
      : undefined,
  });
}

/**
 * Guards a chain of sequential Supabase operations.
 * Checks token validity once at the start, then executes the chain.
 * On auth error mid-chain, refreshes and retries the entire chain once.
 */
export async function withSessionGuard<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  await ensureValidSession();

  try {
    return await fn();
  } catch (error) {
    if (isLikelyAuthError(error)) {
      logConnectionEvent({ type: "token_refresh_fail", detail: `session-guard retry: ${label}` });
      const result = await refreshSessionViaServer(`session-guard:${label}`);
      if (!result.ok) throw error;
      return await fn();
    }
    throw error;
  }
}
