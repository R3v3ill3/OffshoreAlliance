'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isAuth =
    error.message.toLowerCase().includes('jwt') ||
    error.message.toLowerCase().includes('not authenticated') ||
    error.message.toLowerCase().includes('auth session')

  if (isAuth) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    return null
  }

  return (
    <html>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: '#666', marginBottom: 16 }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', background: 'white' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
