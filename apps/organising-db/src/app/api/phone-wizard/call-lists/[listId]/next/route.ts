import { NextResponse } from 'next/server'

/**
 * @deprecated Phase B: /api/phone-wizard/call-lists/[listId]/next is retired.
 * Use /api/campaigns/[id]/call-lists/[listId]/next instead.
 */
export function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists/[listId]/next instead.' },
    { status: 410 }
  )
}

export function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists/[listId]/next instead.' },
    { status: 410 }
  )
}
