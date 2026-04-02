'use client'

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { SupabaseAuthProvider } from '@/components/providers/SupabaseAuthProvider'
// Import Sentry client configuration for error tracking
import '@/../../sentry.client.config'

function isAuthError(error: unknown): boolean {
  if (!error) return false
  const msg = String(error instanceof Error ? error.message : error).toLowerCase()
  return (
    msg.includes('jwt expired') ||
    msg.includes('jwt') ||
    msg.includes('refresh_token') ||
    msg.includes('invalid claim') ||
    msg.includes('not authenticated') ||
    msg.includes('permission denied') ||
    msg.includes('pgrst301') ||
    msg.includes('authsessionmissingerror') ||
    msg.includes('auth session missing') ||
    (error instanceof Object && 'code' in error && (error as { code: string }).code === 'PGRST301')
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (isAuthError(error)) {
              queryClient.clear()
              window.location.href = '/login'
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              if (isAuthError(error)) return false
              return failureCount < 3
            },
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseAuthProvider>
        <TooltipProvider>
          {children}
          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </SupabaseAuthProvider>
    </QueryClientProvider>
  )
}
