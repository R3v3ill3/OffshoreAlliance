/**
 * GET /api/cron/poll-mailbox-events
 *
 * Scheduled every 10 minutes by Vercel cron (vercel.json).
 * Guarded by Authorization: Bearer <CRON_SECRET>.
 *
 * For each active Microsoft OAuth connection:
 *   1. Fetches messages received since last_polled_at (default: 24 h ago).
 *   2. Matches them to email_send_log rows by conversationId.
 *   3. Records replies (first reply → worker note + tag; subsequent → count bump).
 *   4. Detects DSN/bounce messages and marks worker emails invalid.
 *   5. Updates last_polled_at.
 *
 * Architecture decisions respected:
 *   - Count all replies; persist details for first reply only.
 *   - DSN pattern: postmaster/mailer-daemon OR undelivered/delivery/bounce subject.
 *   - Bounce auto-skips worker in recipient selection (email_status='invalid').
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMicrosoftAccessToken } from '@/lib/integrations/microsoft-connection'
import { MICROSOFT_GRAPH_BASE } from '@/lib/integrations/microsoft-graph'
import {
  tagWorkerReplied,
  markEmailBounced,
} from '@/lib/comms/send-log'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphMessageEnvelope {
  id: string
  conversationId: string
  subject: string
  bodyPreview: string
  receivedDateTime: string
  isDraft: boolean
  from: { emailAddress: { address: string; name?: string } }
  toRecipients: { emailAddress: { address: string; name?: string } }[]
  body?: { content: string; contentType: string }
}

interface GraphMessagesPage {
  value: GraphMessageEnvelope[]
  '@odata.nextLink'?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DSN_FROM_RE = /^(postmaster|mailer-daemon|noreply.*microsoft)@/i
const DSN_SUBJECT_RE =
  /(undelivered|delivery (status|failure)|returned mail|bounce)/i
// RFC 3461 / 3464 final-recipient / original-recipient
const DSN_RECIPIENT_RE =
  /(?:final-recipient|original-recipient)\s*:\s*rfc822\s*;\s*([^\s;]+)/gi
// Fallback: any email-like string in the body
const EMAIL_IN_BODY_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g
const MAX_MESSAGES_PER_POLL = 500
const FIRST_POLL_HOURS = 24

// ─── Graph helpers ────────────────────────────────────────────────────────────

async function fetchGraphMessages(
  accessToken: string,
  since: Date,
  organizerEmailAddress: string,
): Promise<GraphMessageEnvelope[]> {
  const since_iso = since.toISOString()
  const filter = `receivedDateTime ge ${since_iso} and isDraft eq false`
  const select =
    'id,conversationId,subject,bodyPreview,receivedDateTime,isDraft,from,toRecipients,body'
  let url: string | undefined =
    `${MICROSOFT_GRAPH_BASE}/me/messages` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$select=${encodeURIComponent(select)}` +
    `&$top=100` +
    `&$orderby=${encodeURIComponent('receivedDateTime asc')}`

  const all: GraphMessageEnvelope[] = []
  let pages = 0

  while (url && all.length < MAX_MESSAGES_PER_POLL) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Graph /me/messages failed (${res.status}): ${text}`)
    }
    const page = (await res.json()) as GraphMessagesPage
    for (const msg of page.value) {
      // Skip messages sent by the organiser themselves (their own outgoing).
      if (
        msg.from.emailAddress.address.toLowerCase() ===
        organizerEmailAddress.toLowerCase()
      ) {
        continue
      }
      all.push(msg)
    }
    url = page['@odata.nextLink']
    pages++
    if (pages > 10) break // safety: at most ~1000 messages
  }

  return all
}

// ─── DSN / bounce parsing ─────────────────────────────────────────────────────

function isDsnMessage(msg: GraphMessageEnvelope): boolean {
  return (
    DSN_FROM_RE.test(msg.from.emailAddress.address) ||
    DSN_SUBJECT_RE.test(msg.subject)
  )
}

function extractBouncedAddresses(msg: GraphMessageEnvelope): string[] {
  const body = msg.body?.content ?? msg.bodyPreview ?? ''
  const found = new Set<string>()

  // Try RFC 3464 structured fields first.
  DSN_RECIPIENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DSN_RECIPIENT_RE.exec(body)) !== null) {
    found.add(m[1].toLowerCase().replace(/^<|>$/g, ''))
  }

  if (found.size === 0) {
    // Fallback: any email-like token in body.
    EMAIL_IN_BODY_RE.lastIndex = 0
    let m2: RegExpExecArray | null
    while ((m2 = EMAIL_IN_BODY_RE.exec(body)) !== null) {
      found.add(m2[0].toLowerCase())
    }
  }

  return [...found]
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Validate cron secret.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const admin = createAdminClient()

  // Load all active Microsoft connections.
  const { data: connections, error: connErr } = await admin
    .from('user_oauth_connections')
    .select('connection_id, user_id, email, last_polled_at')
    .eq('provider', 'microsoft')
    .eq('status', 'active')

  if (connErr) {
    return NextResponse.json({ error: connErr.message }, { status: 500 })
  }
  if (!connections || connections.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const summary: Array<{
    user_id: string
    messages_checked: number
    replies_found: number
    bounces_found: number
    error?: string
  }> = []

  for (const conn of connections) {
    const userId = conn.user_id as string
    const organizerEmail = (conn.email as string | null) ?? ''
    let tokenResult
    try {
      tokenResult = await getMicrosoftAccessToken(userId)
    } catch (err) {
      summary.push({
        user_id: userId,
        messages_checked: 0,
        replies_found: 0,
        bounces_found: 0,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    // Poll window: last_polled_at - 1 min (skew buffer); first poll = 24 h ago.
    const lastPolled = conn.last_polled_at
      ? new Date(conn.last_polled_at as string)
      : null
    const since = lastPolled
      ? new Date(lastPolled.getTime() - 60_000)
      : new Date(Date.now() - FIRST_POLL_HOURS * 3_600_000)

    let messages: GraphMessageEnvelope[]
    try {
      messages = await fetchGraphMessages(
        tokenResult.accessToken,
        since,
        organizerEmail,
      )
    } catch (err) {
      summary.push({
        user_id: userId,
        messages_checked: 0,
        replies_found: 0,
        bounces_found: 0,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    let repliesFound = 0
    let bouncesFound = 0

    for (const msg of messages) {
      try {
        if (isDsnMessage(msg)) {
          // Bounce handling.
          const addrs = extractBouncedAddresses(msg)
          for (const addr of addrs) {
            // Match against recent send logs for this user.
            const { data: sendRow } = await admin
              .from('email_send_log')
              .select('send_id, worker_id, bounced_at, replied_at')
              .eq('recipient_email', addr)
              .is('bounced_at', null)
              .is('replied_at', null)
              .gte(
                'created_at',
                new Date(Date.now() - 14 * 24 * 3_600_000).toISOString(),
              )
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (!sendRow) continue

            const bounceReason = (msg.subject ?? '').slice(0, 280)
            await admin
              .from('email_send_log')
              .update({
                bounced_at: msg.receivedDateTime,
                bounce_reason: bounceReason,
              })
              .eq('send_id', sendRow.send_id)

            await admin.from('email_engagement_events').insert({
              send_id: sendRow.send_id,
              event_type: 'bounced',
              occurred_at: msg.receivedDateTime,
              payload: { subject: msg.subject, from: msg.from.emailAddress.address },
            })

            await markEmailBounced(sendRow.worker_id as number, bounceReason)
            bouncesFound++
          }
          continue
        }

        // Reply handling — match by conversationId.
        if (!msg.conversationId) continue

        const { data: sendRow } = await admin
          .from('email_send_log')
          .select(
            'send_id, worker_id, campaign_id, replied_at, reply_count, first_reply_message_id',
          )
          .eq('conversation_id', msg.conversationId)
          .limit(1)
          .maybeSingle()

        if (!sendRow) continue

        // Insert engagement event for every reply.
        await admin.from('email_engagement_events').insert({
          send_id: sendRow.send_id,
          event_type: 'replied',
          occurred_at: msg.receivedDateTime,
          payload: {
            message_id: msg.id,
            from: msg.from.emailAddress.address,
            snippet: msg.bodyPreview.slice(0, 280),
          },
        })

        if (!sendRow.replied_at) {
          // First reply.
          const snippet = msg.bodyPreview.slice(0, 280)
          await admin
            .from('email_send_log')
            .update({
              replied_at: msg.receivedDateTime,
              reply_snippet: snippet,
              first_reply_message_id: msg.id,
              latest_reply_message_id: msg.id,
              reply_count: 1,
            })
            .eq('send_id', sendRow.send_id)

          await tagWorkerReplied(sendRow.worker_id as number)

          // Write a worker note with the reply snippet and Outlook deep-link.
          const outlookLink = `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(msg.id)}`
          await admin.from('worker_notes').insert({
            worker_id: sendRow.worker_id,
            campaign_id: sendRow.campaign_id,
            note_text: `Reply received: "${snippet}"\n\n${outlookLink}`,
            flag_for_follow_up: false,
          })
        } else {
          // Subsequent reply — bump count and update latest message id.
          await admin
            .from('email_send_log')
            .update({
              latest_reply_message_id: msg.id,
              reply_count: ((sendRow.reply_count as number) ?? 0) + 1,
            })
            .eq('send_id', sendRow.send_id)
        }

        repliesFound++
      } catch (msgErr) {
        console.error('[poll-mailbox] message processing error:', msgErr)
      }
    }

    // Update last_polled_at.
    await admin
      .from('user_oauth_connections')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('connection_id', conn.connection_id)

    summary.push({
      user_id: userId,
      messages_checked: messages.length,
      replies_found: repliesFound,
      bounces_found: bouncesFound,
    })
  }

  return NextResponse.json({ processed: connections.length, summary })
}
