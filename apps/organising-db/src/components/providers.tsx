"use client";

import { QueryClient, QueryClientProvider, QueryCache, focusManager } from "@tanstack/react-query";
import { useState, useEffect, useRef, Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";
import { resetClient, refreshSessionViaServer, getKnownExpiryMs } from "@/lib/supabase/client";
import { forceLogoutToLogin, isLikelyAuthError } from "@/lib/supabase/session-recovery";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";
import { logCookieDiagnostic } from "@/lib/supabase/cookie-diagnostics";
import { installDiagnosticShims } from "@/lib/supabase/diagnostics-shim";
import { PostHogPageView } from "@/components/posthog-page-view";
import "../../../../sentry.client.config";

const queryCacheRecoveryGuard = { inProgress: false };

// Refresh-ahead window for tab-focus / wake checks (visibility handler,
// focus gate, online/pageshow). When the known token expiry is inside this
// window — or unknown — the wake path refreshes via the server first.
const VISIBILITY_REFRESH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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
  // Routes that do NOT use a Supabase user session. The /call/ and /leader/task
  // families use cookie-based share sessions; /login and /auth are pre-auth.
  // Running the auth heartbeat / visibility refresh on these only produces
  // noise (and, on /login, would loop a no-session server refresh).
  const isUnauthRoute =
    (pathname?.startsWith("/call/") ?? false) ||
    (pathname?.startsWith("/leader/task") ?? false) ||
    (pathname?.startsWith("/login") ?? false) ||
    (pathname?.startsWith("/auth") ?? false);

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

            // Recover via the SERVER (reliable cookie refresh) rather than a
            // client-side refresh, which can hang and produce lock_timeouts.
            refreshSessionViaServer("query-cache-onError")
              .then((result) => {
                if (result.ok) {
                  logConnectionEvent({ type: "token_refresh_ok", detail: "query-cache server refresh" });
                  return client.invalidateQueries();
                }
                if (result.reason === "no_session") {
                  logConnectionEvent({ type: "token_refresh_fail", detail: "query-cache server refresh: no session" });
                  forceLogoutToLogin("refresh_failed");
                  return;
                }
                // Transient (timeout / network) — do NOT log out; the next
                // query retry or the heartbeat will recover.
                logConnectionEvent({
                  type: "token_refresh_fail",
                  detail: `query-cache server refresh transient: ${result.reason}`,
                });
              })
              .catch(() => {
                logConnectionEvent({ type: "token_refresh_fail", detail: "query-cache server refresh exception" });
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
    if (isUnauthRoute) return;

    // Refresh on focus when the token is within VISIBILITY_REFRESH_WINDOW_MS
    // of expiry (or when we don't yet know the expiry). A quick tab-switch
    // with a comfortably fresh token does NOTHING — no network, no client
    // getSession.

    // Shared wake-up check. Decides CHEAPLY whether a refresh is needed. We
    // deliberately do NOT call the client's getSession() here: near expiry it
    // fires an in-line network token refresh that stalls after the tab wakes
    // (the lock_timeout cascade). Instead we read the last-known expiry and,
    // if stale, refresh via the SERVER — the reliable path.
    const checkTokenOnWake = async (trigger: string) => {
      if (document.visibilityState !== "visible") return;

      // Diagnostic: log cookie state on every wake-up
      logCookieDiagnostic(trigger);

      // Mark the probe time so the 60s heartbeat skips its own check during
      // the post-wake window.
      lastVisibilityCheckAtRef.current = Date.now();

      const expMs = getKnownExpiryMs();
      const needsRefresh = expMs === null || expMs - Date.now() < VISIBILITY_REFRESH_WINDOW_MS;
      if (!needsRefresh) {
        resetRecoveryFailureBudgets();
        return;
      }

      await runServerRefresh("visibility");
    };

    const visHandler = async () => {
      logConnectionEvent({
        type: "visibility_change",
        detail: document.visibilityState,
      });
      await checkTokenOnWake("visibility-return");
    };

    // Laptop sleep / Edge sleeping-tab resume can happen WITHOUT a
    // visibilitychange (the tab was visible the whole time). The `online`
    // event fires when the network comes back, and `pageshow` with
    // `persisted` fires on bfcache restores — both moments where the token
    // may have gone stale while no timer was running.
    const onlineHandler = () => {
      logConnectionEvent({ type: "visibility_change", detail: "network-online" });
      void checkTokenOnWake("network-online");
    };
    const pageshowHandler = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      logConnectionEvent({ type: "visibility_change", detail: "bfcache-restore" });
      void checkTokenOnWake("bfcache-restore");
    };

    document.addEventListener("visibilitychange", visHandler);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("pageshow", pageshowHandler);
    return () => {
      document.removeEventListener("visibilitychange", visHandler);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("pageshow", pageshowHandler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, isUnauthRoute]);

  // Mirror of isUnauthRoute for the focus gate below (registered once).
  const isUnauthRouteRef = useRef(isUnauthRoute);
  useEffect(() => {
    isUnauthRouteRef.current = isUnauthRoute;
  }, [isUnauthRoute]);

  // FOCUS GATE — make React Query's refetch-on-focus wait for the token check.
  //
  // By default React Query refetches every stale query the instant the tab
  // becomes visible. If the access token went stale while the machine slept,
  // that refetch burst races our server refresh: each query's
  // `_getAccessToken` → `getSession()` sees the stale token and fires an
  // IN-LINE CLIENT-SIDE refresh under the global auth lock — on a post-wake
  // cold network that refresh stalls, the lock jams, and every query hangs
  // with no error (the infinite-spinner mode).
  //
  // Gating focus delivery means: token comfortably fresh → refetch
  // immediately (zero added latency); token stale/unknown → one server
  // refresh first (deduped with the visibility handler's), THEN refetch with
  // the fresh cookie so no query ever needs a client-side refresh.
  useEffect(() => {
    focusManager.setEventListener((handleFocus) => {
      const onVisibilityChange = () => {
        if (document.visibilityState !== "visible") {
          handleFocus(false);
          return;
        }
        if (isUnauthRouteRef.current) {
          handleFocus(true);
          return;
        }
        const expMs = getKnownExpiryMs();
        const stale = expMs === null || expMs - Date.now() < VISIBILITY_REFRESH_WINDOW_MS;
        if (!stale) {
          handleFocus(true);
          return;
        }
        // refreshSessionViaServer is bounded (8s) and never throws; release
        // the refetch burst regardless of outcome — a failed refresh routes
        // queries into the normal error/recovery path instead of a silent hang.
        refreshSessionViaServer("focus-gate").finally(() => handleFocus(true));
      };
      window.addEventListener("visibilitychange", onVisibilityChange, false);
      return () => window.removeEventListener("visibilitychange", onVisibilityChange);
    });
  }, []);

  // Refs backing the auth heartbeat + recovery budgets.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Consecutive `no_session` responses from the server refresh, per source.
  // Require 2 in a row before redirecting to login (one can be transient).
  const visibilityNullSessionFailuresRef = useRef(0);
  const heartbeatRecoveryFailuresRef = useRef(0);
  // Consecutive transient server-refresh failures with no success in between.
  // Drives the soft-reload recovery ladder.
  const consecutiveLockTimeoutsRef = useRef(0);
  // Timestamp of the last visibility-triggered refresh, so the heartbeat can
  // skip its own refresh during the post-focus window.
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

  // Number of consecutive transient server-refresh failures before we attempt
  // automatic recovery. The server refresh itself times out at 8s, so 3
  // consecutive failures indicates a genuine problem (not a one-off blip).
  const SERVER_REFRESH_FAILURE_THRESHOLD = 3;

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
   * Recovery ladder, SERVER-FIRST. Used only when the normal server refresh has
   * failed repeatedly:
   *   1. resetClient() — drop a fresh GoTrueClient (clears any jammed in-memory
   *      auth lock that a soft reload would otherwise be needed to clear).
   *   2. refreshSessionViaServer() — the reliable cookie-based refresh.
   *   3. If the server path itself fails, soft reload (re-inits JS + lets the
   *      middleware refresh the cookie on the reloaded request).
   * NEVER force-logs-out on a transient failure: a refresh timeout is not a
   * confirmed session loss. Only a confirmed `no_session` redirects to login.
   */
  const attemptLockDeadlockRecovery = async (source: string) => {
    if (lockRecoveryInProgressRef.current) return;
    lockRecoveryInProgressRef.current = true;
    try {
      logConnectionEvent({ type: "recovery_start", detail: `auth-recovery (${source}): client reset + server refresh` });
      resetClient();
      const result = await refreshSessionViaServer(`recovery:${source}`);
      if (result.ok) {
        resetRecoveryFailureBudgets();
        await queryClient.invalidateQueries();
        logConnectionEvent({ type: "recovery_end", detail: `auth-recovery (${source}): server refresh restored session` });
        return;
      }
      if (result.reason === "no_session") {
        logConnectionEvent({ type: "recovery_end", detail: `auth-recovery (${source}): server reports no session — redirecting` });
        forceLogoutToLogin("session_expired");
        return;
      }
      logConnectionEvent({
        type: "recovery_end",
        detail: `auth-recovery (${source}): server refresh failed (${result.reason}) — escalating to soft reload`,
      });
      softReloadForLockDeadlock();
    } catch (err) {
      logConnectionEvent({
        type: "recovery_end",
        detail: `auth-recovery (${source}): exception — ${err instanceof Error ? err.message : String(err)}`,
      });
      softReloadForLockDeadlock();
    } finally {
      lockRecoveryInProgressRef.current = false;
    }
  };

  /**
   * Shared refresh path for the visibility handler and heartbeat. Refreshes the
   * session via the SERVER and branches on the tagged result:
   *   ok          → clear failure budgets, invalidate queries (refetch fresh).
   *   no_session  → genuine logout candidate; redirect only after 2 in a row.
   *   transient   → count it; escalate to the recovery ladder after a few.
   * NEVER hangs the UI: refreshSessionViaServer is bounded at 8s and never
   * throws.
   */
  const runServerRefresh = async (source: "visibility" | "heartbeat") => {
    const result = await refreshSessionViaServer(source);

    if (result.ok) {
      resetRecoveryFailureBudgets();
      logConnectionEvent({ type: "token_refresh_ok", detail: `server refresh ok (${source})` });
      queryClient.invalidateQueries();
      return;
    }

    if (result.reason === "no_session") {
      logConnectionEvent({ type: "session_lost", detail: `server refresh: no session (${source})` });
      const escalate =
        source === "visibility" ? shouldEscalateVisibilityFailure() : shouldEscalateHeartbeatFailure();
      if (escalate) forceLogoutToLogin("session_expired");
      return;
    }

    // Transient (timeout / network / http / error) — do NOT log out.
    consecutiveLockTimeoutsRef.current += 1;
    logConnectionEvent({
      type: "network_error",
      detail: `server refresh transient (${source}, ${result.reason}); consecutive=${consecutiveLockTimeoutsRef.current}`,
    });
    if (consecutiveLockTimeoutsRef.current >= SERVER_REFRESH_FAILURE_THRESHOLD) {
      void attemptLockDeadlockRecovery(source);
    }
  };
  // Auth session heartbeat — keeps the token fresh PROACTIVELY so it never
  // expires silently (which used to make RLS return empty results, or make the
  // next getSession() fire a hanging client-side refresh). It checks the
  // last-known expiry locally and only refreshes — via the SERVER — when the
  // token is close to expiry. No client getSession(), no per-tick network call
  // while the token is healthy.
  useEffect(() => {
    if (isUnauthRoute) return;

    const HEARTBEAT_INTERVAL_MS = 60_000; // every 60 seconds
    // Skip the heartbeat refresh if the visibility handler just ran one.
    const HEARTBEAT_VISIBILITY_DEDUPE_MS = 10_000;
    // Refresh when the token is within this window of expiry.
    const HEARTBEAT_REFRESH_AHEAD_MS = 4 * 60 * 1000; // 4 minutes

    const heartbeat = async () => {
      try {
        // Never probe while hidden — a hidden tab has nothing to render, and
        // background timer throttling is what historically orphaned auth ops.
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

        // Don't duplicate a visibility-triggered refresh burst.
        if (Date.now() - lastVisibilityCheckAtRef.current < HEARTBEAT_VISIBILITY_DEDUPE_MS) return;

        // Cheap no-op while the token still has comfortable life left — NO
        // network and NO client getSession (which is what used to hang).
        const expMs = getKnownExpiryMs();
        if (expMs !== null && expMs - Date.now() > HEARTBEAT_REFRESH_AHEAD_MS) return;

        await runServerRefresh("heartbeat");
      } catch {
        // best effort — don't let heartbeat failures cascade
      }
    };

    heartbeatRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, isUnauthRoute]);

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
