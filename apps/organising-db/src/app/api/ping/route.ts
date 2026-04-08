import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: process.env.NEXT_RUNTIME ?? 'unknown',
  })
}
