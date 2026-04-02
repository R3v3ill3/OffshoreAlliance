'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

function isAuthError(error: Error): boolean {
  const msg = error.message.toLowerCase()
  return (
    msg.includes('jwt') ||
    msg.includes('refresh_token') ||
    msg.includes('not authenticated') ||
    msg.includes('auth session missing') ||
    msg.includes('pgrst301') ||
    msg.includes('permission denied')
  )
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    if (isAuthError(error)) {
      router.push('/login')
    }
  }, [error, router])

  if (isAuthError(error)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="text-lg font-semibold">Session expired</h2>
          <p className="text-sm text-muted-foreground">
            Your session has expired. Redirecting to login...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </div>
  )
}
