"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";
import { createClient } from "@/lib/supabase/client";
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
          // #region agent log
          fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'42d665'},body:JSON.stringify({sessionId:'42d665',runId:'pre-fix-2',hypothesisId:'H6',location:'providers.tsx:queryCache:onError',message:'QueryCache onError fired',data:{queryKey:String(query.queryKey[0]??'unknown'),message:error instanceof Error?error.message:String(error),status:typeof error==='object'&&error!==null&&typeof (error as Record<string,unknown>).status==='number'?(error as Record<string,unknown>).status:null,isAuthLike:isLikelyAuthError(error)},timestamp:Date.now()})}).catch(()=>{});
          // #endregion

          logConnectionEvent({
            type: "api_error",
            detail: `${String(query.queryKey[0])}: ${error instanceof Error ? error.message : String(error)}`,
          });

          if (isLikelyAuthError(error)) {
            if (queryCacheRecoveryGuard.inProgress) return;
            queryCacheRecoveryGuard.inProgress = true;

            const supabase = createClient();
            supabase.auth.refreshSession()
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
          staleTime: 60 * 1000,
          retry: (failureCount, error) => {
            if (isNonRetryableStatus(error)) return false;
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
    const visHandler = () => {
      logConnectionEvent({
        type: "visibility_change",
        detail: document.visibilityState,
      });
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
