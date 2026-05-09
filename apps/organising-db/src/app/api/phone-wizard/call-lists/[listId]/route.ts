import { NextResponse } from 'next/server'

/**
 * @deprecated Phase B: /api/phone-wizard/call-lists/[listId] is retired.
 * All call-list operations now use /api/campaigns/[id]/call-lists.
 */
export function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists instead.' },
    { status: 410 }
  )
}

export function PUT() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists instead.' },
    { status: 410 }
  )
}

export function PATCH() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists instead.' },
    { status: 410 }
  )
}

export function DELETE() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-lists instead.' },
    { status: 410 }
  )
}
