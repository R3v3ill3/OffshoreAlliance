"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { agentDebugLog } from "@/lib/agent-debug-log";
import { DeviceProvider } from "@/contexts/device-context";
import { createClient } from "@/lib/supabase/client";
import { isLikelyAuthError, recoverSessionConnection } from "@/lib/supabase/session-recovery";
// Import Sentry client configuration for error tracking
import "../../../../sentry.client.config";

export function Providers({ children, isMobile }: { children: ReactNode; isMobile: boolean }) {
  const authRecoveryInProgressRef = useRef(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            console.error("[QueryCache] Error in query", query.queryKey, error);
            // #region agent log
            const errRec = error as unknown as Record<string, unknown>;
            agentDebugLog({
              location: "providers.tsx:QueryCache.onError",
              message: "Query error",
              data: {
                queryKey: query.queryKey,
                errorMessage:
                  error instanceof Error ? error.message : String(error),
                errorCode: errRec?.code ?? null,
                errorDetails: errRec?.details ?? null,
                errorHint: errRec?.hint ?? null,
                errorStatus: errRec?.status ?? null,
                authRecoveryInProgress: authRecoveryInProgressRef.current,
              },
              hypothesisId: "H2",
            });
            // #endregion
            if (isLikelyAuthError(error)) {
              if (authRecoveryInProgressRef.current) {
                return;
              }

              authRecoveryInProgressRef.current = true;
              void recoverSessionConnection({
                supabase: createClient(),
                queryClient,
                source: "query-cache-auth-error",
                reloadOnSuccess: false,
                redirectOnFailure: true,
              }).finally(() => {
                authRecoveryInProgressRef.current = false;
              });
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  // #region agent log
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      agentDebugLog({
        location: "providers.tsx:unhandledRejection",
        message: "Unhandled promise rejection",
        data: {
          reason:
            event.reason instanceof Error
              ? event.reason.message
              : String(event.reason),
        },
        hypothesisId: "H5",
      });
    };
    const visHandler = () => {
      agentDebugLog({
        location: "providers.tsx:visibilityChange",
        message: "Tab visibility changed",
        data: { visibilityState: document.visibilityState },
        hypothesisId: "H1",
      });
    };
    window.addEventListener('unhandledrejection', handler);
    document.addEventListener('visibilitychange', visHandler);
    return () => {
      window.removeEventListener('unhandledrejection', handler);
      document.removeEventListener('visibilitychange', visHandler);
    };
  }, []);
  // #endregion

  return (
    <DeviceProvider isMobile={isMobile}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </DeviceProvider>
  );
}
