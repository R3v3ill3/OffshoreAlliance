import { NextResponse } from 'next/server'

/**
 * @deprecated Phase B: /api/phone-wizard/call-lists is retired.
 * All call-list operations now use /api/campaigns/[id]/call-lists.
 */
export function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists instead.' },
    { status: 410 }
  )
}

export function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists instead.' },
    { status: 410 }
  )
}
