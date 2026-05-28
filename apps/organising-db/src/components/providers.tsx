"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, useEffect, useRef, Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";
import { createClient, coordinatedRefreshSession, getSessionWithTimeout, resetClient } from "@/lib/supabase/client";
import { forceLogoutToLogin, isLikelyAuthError, recoverSessionConnection } from "@/lib/supabase/session-recovery";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";
import { logCookieDiagnostic } from "@/lib/supabase/cookie-diagnostics";
import { installDiagnosticShims } from "@/lib/supabase/diagnostics-shim";
import { PostHogPageView } from "@/components/posthog-page-view";
import "../../../../sentry.client.config";

const queryCacheRecoveryGuard = { inProgress: false };

function isNonRetryableStatus(error: unknown): boolean {
  const status =
    error && typeof error === "object"
      ? (error as Record<string, unknown>).status
      : undefined;
  return (
    typeof status === "number" && status >= 400 && status < 500
  );
}

export function Providers({ children, isMobile }: { children: ReactNode; isMobile: boolean }) {
  const pathname = usePathname();
  // The /call/ route family uses cookie-based share sessions, not Supabase
  // auth. Running auth heartbeats or visibility-change getSession calls here
  // only produces lock_timeout noise when the OS Phone app steals focus.
  const isShareDialerRoute = pathname?.startsWith("/call/") ?? false;

  const [queryClient] = useState(() => {
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          console.error("[QueryCache] Error in query", query.queryKey, error);

          logConnectionEvent({
            type: "api_error",
            detail: `${String(query.queryKey[0])}: ${error instanceof Error ? error.message : String(error)}`,
          });

          if (isLikelyAuthError(error)) {
            if (queryCacheRecoveryGuard.inProgress) return;
            queryCacheRecoveryGuard.inProgress = true;

            coordinatedRefreshSession("query-cache-onError")
              .then(({ data, error: refreshError }) => {
                if (!refreshError && data.session) {
                  logConnectionEvent({ type: "token_refresh_ok", detail: "query-cache soft refresh" });
                  return client.invalidateQueries();
                }
                logConnectionEvent({
                  type: "token_refresh_fail",
                  detail: `query-cache refresh failed: ${refreshError?.message ?? "no session"}`,
                });
                forceLogoutToLogin("refresh_failed");
              })
              .catch(() => {
                logConnectionEvent({ type: "token_refresh_fail", detail: "query-cache refresh exception" });
              })
              .finally(() => {
                queryCacheRecoveryGuard.inProgress = false;
              });
          }
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          retry: (failureCount, error) => {
            if (isNonRetryableStatus(error)) return false;
            if (isLikelyAuthError(error)) return failureCount < 1;
            return failureCount < 3;
          },
          retryDelay: (attemptIndex) =>
            Math.min(1000 * 2 ** attemptIndex, 30000),
        },
      },
    });
    return client;
  });

  // Install diagnostic shims once on mount
  useEffect(() => {
    installDiagnosticShims();
  }, []);

  useEffect(() => {
    if (isShareDialerRoute) return;

    const TOKEN_NEAR_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

    const visHandler = async () => {
      logConnectionEvent({
        type: "visibility_change",
        detail: document.visibilityState,
      });

      if (document.visibilityState !== "visible") return;

      // Diagnostic: log cookie state on every tab focus
      logCookieDiagnostic("visibility-return");

      // p2: mark that a visibility-triggered auth probe is happening now, so the
      // 60s heartbeat skips its own getSession during the post-focus burst.
      lastVisibilityCheckAtRef.current = Date.now();

      // Proactively refresh the session when the user returns to the tab.
      // The browser may have throttled the Supabase background refresh timer
      // while the tab was hidden, leaving the token expired or close to expiry.
      try {
        const { session, timedOut } = await getSessionWithTimeout("visibility");

        if (timedOut) {
          // getSession exceeded the 12s budget. This is most often a sibling
          // tab racing the same refresh — both tabs hit Supabase's auth
          // service simultaneously, one wins, the other queues and is slow.
          //
          // CRITICAL: do NOT escalate to forceLogoutToLogin here. The
          // underlying auth call may still complete after we've timed out;
          // queries already running in this tab use the cached access token
          // in headers and remain functional. If the cached token is
          // genuinely invalid, the next real query will get a 401 and our
          // existing query-cache recovery path handles it cleanly.
          //
          // handleLockTimeout records the timeout and, after repeated timeouts,
          // runs the reset-then-reload ladder (never force-logout).
          handleLockTimeout("visibility");
          return;
        }

        if (!session) {
          // Genuine null session (getSession returned null without timing
          // out). This is a real session-loss signal — try to recover, and
          // only force-logout on confirmed refresh failure.
          logConnectionEvent({ type: "session_lost", detail: "visibility-null-session" });
          logCookieDiagnostic("visibility-null-session");

          try {
            const { data, error } = await coordinatedRefreshSession("visibility-null-session");
            if (error || !data.session) {
              const result = await recoverSessionConnection({
                supabase: createClient(),
                queryClient,
                source: "manual",
                reloadOnSuccess: false,
                redirectOnFailure: false,
                validateWorkloadAccess: false,
              });
              if (result.ok) {
                resetRecoveryFailureBudgets();
                logConnectionEvent({ type: "token_refresh_ok", detail: "visibility null session recovered via full recovery" });
                queryClient.invalidateQueries();
                return;
              }
              const escalate = shouldEscalateVisibilityFailure();
              logConnectionEvent({
                type: "token_refresh_fail",
                detail: `visibility null session unresolved (${result.reasonCode}); escalation=${escalate}`,
              });
              if (escalate) {
                forceLogoutToLogin(result.reasonCode || "session_expired");
              }
            } else {
              resetRecoveryFailureBudgets();
              logConnectionEvent({ type: "token_refresh_ok", detail: "visibility null session recovered" });
              queryClient.invalidateQueries();
            }
          } catch {
            const escalate = shouldEscalateVisibilityFailure();
            logConnectionEvent({
              type: "token_refresh_fail",
              detail: `visibility null session — exception; escalation=${escalate}`,
            });
            if (escalate) {
              forceLogoutToLogin("session_check_error");
            }
          }
          return;
        }

        resetRecoveryFailureBudgets();

        const expiresAtMs = (session.expires_at ?? 0) * 1000;
        const now = Date.now();

        if (expiresAtMs - now < TOKEN_NEAR_EXPIRY_MS) {
          logConnectionEvent({ type: "token_refresh_ok", detail: "proactive visibility refresh" });
          coordinatedRefreshSession("visibility-refresh");
        }
      } catch {
        // best effort — failure here is non-fatal; normal recovery paths still apply
      }
    };

    document.addEventListener("visibilitychange", visHandler);
    return () => document.removeEventListener("visibilitychange", visHandler);
  }, [queryClient]);

  // Fix 7: Auth session heartbeat — periodic probe to detect silent auth failures.
  // When the auth token expires but the Supabase client silently uses it, queries
  // return empty results (RLS blocks access for the 'anon' role) with no errors.
  // This heartbeat detects that condition by checking if the user_profiles query
  // returns the expected row for the current user.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibilityNullSessionFailuresRef = useRef(0);
  const heartbeatRecoveryFailuresRef = useRef(0);
  // Consecutive auth-lock timeouts (getSession via visibility/heartbeat) with no
  // healthy session in between. Drives the reset-then-reload recovery ladder.
  const consecutiveLockTimeoutsRef = useRef(0);
  // Timestamp of the last visibility-triggered getSession, so the heartbeat can
  // skip its own probe during the post-focus burst window (reduces lock pressure
  // at exactly the moment the deadlock tends to form).
  const lastVisibilityCheckAtRef = useRef(0);
  // Guards the recovery ladder so heartbeat + visibility can't run it twice.
  const lockRecoveryInProgressRef = useRef(false);

  const resetRecoveryFailureBudgets = () => {
    visibilityNullSessionFailuresRef.current = 0;
    heartbeatRecoveryFailuresRef.current = 0;
    consecutiveLockTimeoutsRef.current = 0;
  };

  const shouldEscalateVisibilityFailure = () => {
    visibilityNullSessionFailuresRef.current += 1;
    return visibilityNullSessionFailuresRef.current >= 2;
  };

  const shouldEscalateHeartbeatFailure = () => {
    heartbeatRecoveryFailuresRef.current += 1;
    return heartbeatRecoveryFailuresRef.current >= 2;
  };

  // Number of consecutive lock timeouts before we attempt automatic recovery.
  // 1 could be a transient cross-tab refresh race; 2 (~2 min at the 60s
  // heartbeat) indicates the auth client is genuinely deadlocked.
  const LOCK_TIMEOUT_ESCALATION_THRESHOLD = 2;

  /**
   * Last-resort recovery from a stuck auth lock. A soft reload re-initialises
   * the JS context (clearing auth-js's in-memory lock state, which resetClient
   * alone cannot fully clear) while PRESERVING the auth cookies — so the user
   * stays logged in. Guarded by a sessionStorage cooldown so we never loop.
   */
  const softReloadForLockDeadlock = () => {
    const STORAGE_KEY = "oa:last-lock-deadlock-reload-at";
    const COOLDOWN_MS = 90_000;
    try {
      const previousRaw = window.sessionStorage.getItem(STORAGE_KEY);
      const previous = previousRaw ? Number(previousRaw) : 0;
      if (Number.isFinite(previous) && previous > 0 && Date.now() - previous < COOLDOWN_MS) {
        // Already reloaded recently and still stuck — stop, let the banner offer
        // manual recovery rather than reload-loop.
        logConnectionEvent({
          type: "lock_timeout",
          detail: "lock-deadlock: soft reload suppressed (cooldown) — manual recovery needed",
        });
        return;
      }
      window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // best effort
    }
    logConnectionEvent({ type: "recovery_start", detail: "lock-deadlock: soft reload (cookies preserved, no logout)" });
    window.location.reload();
  };

  /**
   * Reset-then-reload recovery ladder for the auth-lock deadlock:
   *   1. resetClient() — a fresh GoTrueClient clears the stuck `lockAcquired`
   *      flag; probe once with a bounded getSession.
   *   2. If still unhealthy, soft reload (preserves session, no logout).
   * NEVER force-logs-out: a lock timeout is not a confirmed session loss.
   */
  const attemptLockDeadlockRecovery = async (source: string) => {
    if (lockRecoveryInProgressRef.current) return;
    lockRecoveryInProgressRef.current = true;
    try {
      logConnectionEvent({ type: "recovery_start", detail: `lock-deadlock (${source}): in-place client reset` });
      resetClient();
      const { session, timedOut } = await getSessionWithTimeout("lock-deadlock-recovery");
      if (!timedOut && session?.user) {
        consecutiveLockTimeoutsRef.current = 0;
        logConnectionEvent({ type: "session_recovered", detail: "lock-deadlock: recovered via client reset (no reload)" });
        await queryClient.invalidateQueries();
        logConnectionEvent({ type: "recovery_end", detail: "lock-deadlock: in-place success" });
        return;
      }
      logConnectionEvent({
        type: "recovery_end",
        detail: `lock-deadlock: client reset insufficient (timedOut=${timedOut}) — escalating to soft reload`,
      });
      softReloadForLockDeadlock();
    } catch (err) {
      logConnectionEvent({
        type: "recovery_end",
        detail: `lock-deadlock: recovery exception — ${err instanceof Error ? err.message : String(err)}`,
      });
      softReloadForLockDeadlock();
    } finally {
      lockRecoveryInProgressRef.current = false;
    }
  };

  /**
   * Records a lock timeout and triggers the recovery ladder once we've seen
   * enough consecutive timeouts to be confident the auth client is deadlocked.
   * Replaces the old "log and bail forever" behaviour that left the user stuck
   * until they manually hit Full Reset (which logged them out).
   */
  const handleLockTimeout = (source: string) => {
    consecutiveLockTimeoutsRef.current += 1;
    logConnectionEvent({
      type: "lock_timeout",
      detail: `${source}-getSession-timeout (consecutive=${consecutiveLockTimeoutsRef.current})`,
    });
    if (consecutiveLockTimeoutsRef.current >= LOCK_TIMEOUT_ESCALATION_THRESHOLD) {
      void attemptLockDeadlockRecovery(source);
    }
  };
  useEffect(() => {
    if (isShareDialerRoute) return;

    const HEARTBEAT_INTERVAL_MS = 60_000; // every 60 seconds
    // p2: skip the heartbeat getSession if the visibility handler ran one within
    // this window (avoids stacking concurrent auth ops onto the lock at focus).
    const HEARTBEAT_VISIBILITY_DEDUPE_MS = 10_000;

    const heartbeat = async () => {
      try {
        // p2: never probe auth while the tab is hidden. Throttled background
        // getSession calls are the likely trigger for the lock orphan, and a
        // hidden tab has nothing to render anyway.
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

        // p2: don't duplicate a visibility-triggered getSession burst.
        if (Date.now() - lastVisibilityCheckAtRef.current < HEARTBEAT_VISIBILITY_DEDUPE_MS) return;

        const { session, timedOut } = await getSessionWithTimeout("heartbeat");
        if (timedOut) {
          // Auth client is stuck — record + run the reset-then-reload ladder
          // (never force-logout). The old behaviour just logged and looped
          // forever until the user manually nuke-reset (which logged them out).
          handleLockTimeout("heartbeat");
          return;
        }
        if (!session?.user) return; // Not logged in — nothing to check

        // Healthy getSession — the lock is working; clear the deadlock counter.
        consecutiveLockTimeoutsRef.current = 0;

        const supabase = createClient();
        const { data, error } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!error && !data) {
          // Query succeeded (no error) but returned 0 rows for our own profile.
          // This means the token is expired/invalid and RLS is silently blocking.
          logConnectionEvent({
            type: "api_error",
            detail: "heartbeat: profile query returned null — likely auth failure",
          });
          logCookieDiagnostic("heartbeat-null-profile");

          // Attempt recovery
          const { data: refreshData, error: refreshError } =
            await coordinatedRefreshSession("heartbeat-auth-failure");
          if (refreshError || !refreshData.session) {
            const result = await recoverSessionConnection({
              supabase,
              queryClient,
              source: "query-cache-auth-error",
              reloadOnSuccess: false,
              redirectOnFailure: false,
              validateWorkloadAccess: false,
            });
            if (result.ok) {
              resetRecoveryFailureBudgets();
              logConnectionEvent({ type: "token_refresh_ok", detail: "heartbeat recovery succeeded via full recovery" });
              queryClient.invalidateQueries();
              return;
            }
            const escalate = shouldEscalateHeartbeatFailure();
            logConnectionEvent({
              type: "token_refresh_fail",
              detail: `heartbeat recovery unresolved (${result.reasonCode}); escalation=${escalate}`,
            });
            if (escalate) {
              forceLogoutToLogin(result.reasonCode || "refresh_failed");
            }
          } else {
            resetRecoveryFailureBudgets();
            logConnectionEvent({ type: "token_refresh_ok", detail: "heartbeat recovery succeeded" });
            queryClient.invalidateQueries();
          }
        }
      } catch {
        // best effort — don't let heartbeat failures cascade
      }
    };

    heartbeatRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [queryClient]);

  useEffect(() => {
    const STORAGE_KEY = "oa:last-server-action-mismatch-reload-at";
    const AUTO_RELOAD_COOLDOWN_MS = 60_000;
    const ACTION_MISMATCH_PATTERN = /Failed to find Server Action/i;

    const maybeRecoverFromServerActionMismatch = (message: string) => {
      if (!ACTION_MISMATCH_PATTERN.test(message)) return;

      let shouldReload = true;
      try {
        const previousRaw = window.sessionStorage.getItem(STORAGE_KEY);
        const previous = previousRaw ? Number(previousRaw) : 0;
        if (Number.isFinite(previous) && previous > 0 && Date.now() - previous < AUTO_RELOAD_COOLDOWN_MS) {
          shouldReload = false;
        }
      } catch {
        // best effort
      }

      logConnectionEvent({
        type: "deployment_mismatch",
        detail: `server-action-mismatch-detected; autoReload=${shouldReload}`,
      });

      if (!shouldReload) return;

      try {
        window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        // best effort
      }

      window.location.reload();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : JSON.stringify(reason);
      maybeRecoverFromServerActionMismatch(message);
    };

    const onWindowError = (event: ErrorEvent) => {
      const message = event.message || event.error?.message || "";
      maybeRecoverFromServerActionMismatch(message);
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError);
    };
  }, []);

  return (
    <DeviceProvider isMobile={isMobile}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <PostHogPageView />
        </Suspense>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </DeviceProvider>
  );
}
