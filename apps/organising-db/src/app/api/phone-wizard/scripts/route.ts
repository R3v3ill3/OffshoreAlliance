import { NextResponse } from 'next/server'

/**
 * @deprecated Phase B: /api/phone-wizard/scripts is retired.
 * All script operations now use /api/campaigns/[id]/call-scripts.
 */
export function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-scripts instead.' },
    { status: 410 }
  )
}

export function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/campaigns/[id]/call-scripts instead.' },
    { status: 410 }
  )
}
