"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { agentDebugLog } from "@/lib/agent-debug-log";
import { DeviceProvider } from "@/contexts/device-context";

export function Providers({ children, isMobile }: { children: ReactNode; isMobile: boolean }) {
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
              },
              hypothesisId: "H2",
            });
            // #endregion
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes("JWT") ||
              msg.includes("not authenticated") ||
              msg.includes("401")
            ) {
              // #region agent log
              agentDebugLog({
                location: "providers.tsx:QueryCache.jwt-redirect",
                message: "Redirecting to login from query error",
                data: { queryKey: query.queryKey, msgSnippet: msg.slice(0, 120) },
                hypothesisId: "H2",
              });
              // #endregion
              window.location.href = "/login";
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
