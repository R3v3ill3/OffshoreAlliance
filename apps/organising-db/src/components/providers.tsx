"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, useEffect, useRef, Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";
import { createClient, coordinatedRefreshSession, getSessionWithTimeout } from "@/lib/supabase/client";
import { forceLogoutToLogin, isLikelyAuthError } from "@/lib/supabase/session-recovery";
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
          logConnectionEvent({ type: "lock_timeout", detail: "visibility-getSession-timeout (bailing, no force-logout)" });
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
              logConnectionEvent({ type: "token_refresh_fail", detail: "visibility null session — refresh failed, force logout" });
              forceLogoutToLogin("session_expired");
            } else {
              logConnectionEvent({ type: "token_refresh_ok", detail: "visibility null session recovered" });
              queryClient.invalidateQueries();
            }
          } catch {
            logConnectionEvent({ type: "token_refresh_fail", detail: "visibility null session — exception, force logout" });
            forceLogoutToLogin("session_check_error");
          }
          return;
        }

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
  useEffect(() => {
    if (isShareDialerRoute) return;

    const HEARTBEAT_INTERVAL_MS = 60_000; // every 60 seconds

    const heartbeat = async () => {
      try {
        const { session, timedOut } = await getSessionWithTimeout("heartbeat");
        if (timedOut) {
          // Auth client is stuck — log and bail. The visibility handler will
          // pick up recovery on next tab focus.
          logConnectionEvent({ type: "lock_timeout", detail: "heartbeat-getSession-timeout" });
          return;
        }
        if (!session?.user) return; // Not logged in — nothing to check

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
            logConnectionEvent({ type: "token_refresh_fail", detail: "heartbeat recovery failed — force logout" });
            forceLogoutToLogin("refresh_failed");
          } else {
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
