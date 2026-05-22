import { NextResponse } from 'next/server'

/**
 * Build a JSON error response that preserves Supabase / PostgREST error
 * details (code, message, details, hint) instead of swallowing them as a
 * generic fallback string. This matters when route handlers throw
 * `PostgrestError` objects, which are plain objects (not `Error`
 * instances), so `error instanceof Error` is false and `error.message`
 * is otherwise dropped.
 *
 * @param fallback Human-readable message used when the error has no
 *   recognisable shape.
 * @param error The thrown value from the route handler's try block.
 * @param status HTTP status (defaults to 500).
 */
export function errorResponse(
  fallback: string,
  error: unknown,
  status = 500
): NextResponse {
  const payload: {
    error: string
    code?: string
    details?: string | null
    hint?: string | null
  } = { error: fallback }

  if (error instanceof Error) {
    payload.error = error.message || fallback
  } else if (error && typeof error === 'object') {
    const e = error as {
      message?: unknown
      code?: unknown
      details?: unknown
      hint?: unknown
    }
    if (typeof e.message === 'string' && e.message.length > 0) {
      payload.error = e.message
    }
    if (typeof e.code === 'string') payload.code = e.code
    if (typeof e.details === 'string' || e.details === null) {
      payload.details = e.details ?? null
    }
    if (typeof e.hint === 'string' || e.hint === null) {
      payload.hint = e.hint ?? null
    }
  }

  return NextResponse.json(payload, { status })
}
