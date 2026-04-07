"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";
import { createClient } from "@/lib/supabase/client";
import { isLikelyAuthError, recoverSessionConnection } from "@/lib/supabase/session-recovery";
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
            void recoverSessionConnection({
              supabase: createClient(),
              queryClient: client,
              source: "query-cache-auth-error",
              reloadOnSuccess: false,
              redirectOnFailure: true,
              validateWorkloadAccess: false,
            }).finally(() => {
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
