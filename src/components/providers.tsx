"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { DeviceProvider } from "@/contexts/device-context";

export function Providers({ children, isMobile }: { children: ReactNode; isMobile: boolean }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
