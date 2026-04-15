"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";
import { createClient, coordinatedRefreshSession } from "@/lib/supabase/client";
import { isLikelyAuthError } from "@/lib/supabase/session-recovery";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";
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

  useEffect(() => {
    const TOKEN_NEAR_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

    const visHandler = async () => {
      logConnectionEvent({
        type: "visibility_change",
        detail: document.visibilityState,
      });

      if (document.visibilityState !== "visible") return;

      // Proactively refresh the session when the user returns to the tab.
      // The browser may have throttled the Supabase background refresh timer
      // while the tab was hidden, leaving the token expired or close to expiry.
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

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
  }, []);

  return (
    <DeviceProvider isMobile={isMobile}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </DeviceProvider>
  );
}
