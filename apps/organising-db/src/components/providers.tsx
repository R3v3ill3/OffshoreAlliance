"use client";

import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";

export function Providers({ children, isMobile }: { children: ReactNode; isMobile: boolean }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            console.error("[QueryCache] Error in query", query.queryKey, error);
            // #region agent log
            fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'providers.tsx:QueryCache.onError',message:'Query error',data:{queryKey:query.queryKey,errorMessage:error instanceof Error?error.message:String(error),errorCode:(error as Record<string,unknown>)?.code??null,errorDetails:(error as Record<string,unknown>)?.details??null,errorHint:(error as Record<string,unknown>)?.hint??null,errorStatus:(error as Record<string,unknown>)?.status??null},timestamp:Date.now(),hypothesisId:'H-A,H-C,H-D'})}).catch(()=>{});
            // #endregion
            const msg = error instanceof Error ? error.message : String(error);
            if (
              msg.includes("JWT") ||
              msg.includes("not authenticated") ||
              msg.includes("401")
            ) {
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

  return (
    <DeviceProvider isMobile={isMobile}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </DeviceProvider>
  );
}
