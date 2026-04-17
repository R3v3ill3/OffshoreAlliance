import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import { createClient, coordinatedRefreshSession } from "@/lib/supabase/client";
import { isLikelyAuthError } from "@/lib/supabase/session-recovery";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export async function ensureValidSession(): Promise<boolean> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return false;

  const expiresAt = session.expires_at;
  if (!expiresAt) return true;

  const expiresAtMs = expiresAt * 1000;
  const now = Date.now();

  if (expiresAtMs - now < TOKEN_REFRESH_BUFFER_MS) {
    logConnectionEvent({ type: "token_refresh_ok", detail: "preemptive refresh before mutation" });
    const { error } = await coordinatedRefreshSession("preemptive-mutation");
    return !error;
  }

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
              logConnectionEvent({ type: "token_refresh_fail", detail: "mutation auth error, retrying after refresh" });
              const { error: refreshError } = await coordinatedRefreshSession("mutation-retry");
              if (refreshError) throw error;
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
      const { error: refreshError } = await coordinatedRefreshSession(`session-guard:${label}`);
      if (refreshError) throw error;
      return await fn();
    }
    throw error;
  }
}
