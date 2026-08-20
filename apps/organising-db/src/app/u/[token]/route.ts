/**
 * GET|POST /u/[token]
 *
 * Public unsubscribe endpoint (the {{unsubscribe_url}} link injected by
 * the wrapper, and the RFC 8058 one-click List-Unsubscribe-Post target).
 *
 * Consent lives on-platform: sets workers.email_opt_out (source
 * 'unsubscribe_link'), stamps unsubscribed_at on the correlated
 * email_send_log row, marks the recipient's queued list items
 * 'unsubscribed', and records an engagement event. Idempotent — a reused
 * link re-confirms without error.
 *
 * All DB work is service-role (the recipient is not logged in), the
 * /r/[token] click-redirector pattern.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function page(title: string, message: string): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #f9fafb; color: #1f2937; margin: 0; }
  .card { max-width: 480px; margin: 12vh auto 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.6; color: #6b7280; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function processUnsubscribe(token: string): Promise<NextResponse> {
  if (!token) {
    return page('Link not recognised', 'This unsubscribe link is not valid.')
  }

  const admin = createAdminClient()
  const { data: tokenRow } = await admin
    .from('email_unsubscribe_tokens')
    .select('token, worker_id, send_id, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) {
    return page('Link not recognised', 'This unsubscribe link is not valid.')
  }

  const now = new Date().toISOString()
  const workerId = tokenRow.worker_id as number
  const sendId = tokenRow.send_id as number | null

  // Consent flag — don't clobber an earlier opt-out timestamp.
  await admin
    .from('workers')
    .update({
      email_opt_out: true,
      email_opt_out_at: now,
      email_opt_out_source: 'unsubscribe_link',
    })
    .eq('worker_id', workerId)
    .eq('email_opt_out', false)

  // Screen the worker out of any still-pending platform sends.
  await admin
    .from('email_list_items')
    .update({
      status: 'unsubscribed',
      send_status_detail: 'Unsubscribed via link',
    })
    .eq('worker_id', workerId)
    .in('status', ['pending', 'queued'])

  if (!tokenRow.used_at) {
    await admin
      .from('email_unsubscribe_tokens')
      .update({ used_at: now })
      .eq('token', token)

    if (sendId) {
      await admin
        .from('email_send_log')
        .update({ unsubscribed_at: now })
        .eq('send_id', sendId)
        .is('unsubscribed_at', null)
      await admin.from('email_engagement_events').insert({
        send_id: sendId,
        event_type: 'unsubscribed',
        payload: { token, source: 'unsubscribe_link' },
      })
    }
  }

  return page(
    'You have been unsubscribed',
    'You will no longer receive these emails. If this was a mistake, contact the organiser who has been in touch with you.',
  )
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  return processUnsubscribe(token)
}

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  return processUnsubscribe(token)
}
