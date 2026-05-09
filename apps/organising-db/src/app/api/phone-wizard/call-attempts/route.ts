import { NextResponse } from 'next/server'

/**
 * @deprecated Phase B: /api/phone-wizard/call-attempts is retired.
 * Use /api/campaigns/[id]/call-attempts or /api/calls/attempt instead.
 */
export function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use the campaign-scoped call attempt API instead.' },
    { status: 410 }
  )
}

export function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use the campaign-scoped call attempt API instead.' },
    { status: 410 }
  )
}
