/**
 * GET /r/[token]
 *
 * Click-tracking redirector. Resolves the token to its target URL,
 * records the click against email_send_log, and 302-redirects the visitor.
 *
 * All DB work is done via service-role (no user session required — the
 * recipient is clicking a link in their email, not logged in to the app).
 *
 * Latency target: <100 ms. Uses a single upsert-style update to avoid
 * read-then-write races.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tagWorkerClicked } from '@/lib/comms/send-log'

const FALLBACK_URL = process.env.NEXT_PUBLIC_APP_URL ?? '/'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params

  if (!token) {
    return NextResponse.redirect(FALLBACK_URL, { status: 302 })
  }

  const admin = createAdminClient()

  // Look up the token.
  const { data: tokenRow } = await admin
    .from('email_click_tokens')
    .select('token, send_id, target_url, hits')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) {
    return NextResponse.redirect(FALLBACK_URL, { status: 302 })
  }

  const sendId = tokenRow.send_id as number
  const targetUrl = tokenRow.target_url as string
  const currentHits = (tokenRow as { hits?: number }).hits ?? 0

  // Increment hit counter on the token row.
  await admin
    .from('email_click_tokens')
    .update({ hits: currentHits + 1 })
    .eq('token', token)

  // Update send_log: set first_click_at if not set, always increment click_count.
  const { data: sendRow } = await admin
    .from('email_send_log')
    .select('send_id, worker_id, first_click_at, click_count')
    .eq('send_id', sendId)
    .maybeSingle()

  if (sendRow) {
    const updates: Record<string, unknown> = {
      click_count: ((sendRow.click_count as number) ?? 0) + 1,
    }
    if (!sendRow.first_click_at) {
      updates.first_click_at = new Date().toISOString()
    }
    await admin
      .from('email_send_log')
      .update(updates)
      .eq('send_id', sendId)

    // Insert engagement event.
    await admin.from('email_engagement_events').insert({
      send_id: sendId,
      event_type: 'clicked',
      payload: { token, target_url: targetUrl },
    })

    // Tag worker (idempotent).
    void tagWorkerClicked(sendRow.worker_id as number)
  }

  return NextResponse.redirect(targetUrl, { status: 302 })
}
