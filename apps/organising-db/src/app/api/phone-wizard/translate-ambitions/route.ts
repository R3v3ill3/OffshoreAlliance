/**
 * @deprecated Moved to /api/calls/translate-ambitions (Phase C).
 * Returns 410 Gone for all methods.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Gone — use /api/calls/translate-ambitions', endpoint: '/api/calls/translate-ambitions' },
    { status: 410 }
  )
}
