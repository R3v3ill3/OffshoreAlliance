import { NextResponse } from 'next/server'

/**
 * @deprecated Phase B: /api/phone-wizard/call-lists/[listId]/populate is retired.
 * Use /api/campaigns/[id]/call-lists/[listId]/populate instead.
 */
export function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists/[listId]/populate instead.' },
    { status: 410 }
  )
}
