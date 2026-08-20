/**
 * SendGrid Inbound Parse webhook — the in-app leg of the hybrid inbox.
 *
 * The real mailbox (e.g. organising@offshore-alliance.au) stays the
 * authoritative copy; a forwarding rule sends a copy of every incoming
 * message to inbox@parse.<domain>, whose MX points at SendGrid, which
 * POSTs the parsed message here as multipart/form-data.
 *
 * Auth: shared-secret query param ?token= matched against
 * app_settings.email_inbound_token (Inbound Parse has no signing).
 *
 * Pipeline (idempotent on the RFC 5322 Message-ID):
 *   1. Loop guard: messages from our own sending identity are ignored.
 *   2. Worker match on the sender address.
 *   3. Reply correlation: the worker's most recent platform send within
 *      30 days → replied_at / reply_count / reply_snippet on
 *      email_send_log (+ 'replied' engagement event + worker tag).
 *   4. Conversation attach/create — open thread for the address
 *      (campaign scope from the correlated send ≤ 7 days), else create
 *      (needs_response when worker-matched, triage otherwise; the
 *      UNIQUE NULLS NOT DISTINCT thread key absorbs races and reopens
 *      closed threads).
 *   5. Message append + atomic unread/state touch RPC.
 */

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEmailSenderIdentity } from '@/lib/email/provider'
import { tagWorkerReplied } from '@/lib/comms/send-log'

export const dynamic = 'force-dynamic'

const UNIQUE_VIOLATION = '23505'
const RECENT_SEND_WINDOW_DAYS = 7
const REPLY_CORRELATION_WINDOW_DAYS = 30

function tokenMatches(presented: string, expected: string): boolean {
  if (!presented || !expected) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Extract the bare address from "Display Name <addr@host>" forms. */
function extractAddress(raw: string | null): string | null {
  if (!raw) return null
  const angled = raw.match(/<([^<>\s]+@[^<>\s]+)>/)
  const candidate = angled ? angled[1] : raw.trim()
  const cleaned = candidate.replace(/^["']|["']$/g, '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null
}

/** Pull a header value out of the raw headers blob Inbound Parse sends. */
function headerValue(rawHeaders: string, name: string): string | null {
  // Headers are CRLF-separated with possible folded continuation lines.
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ')
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const m = unfolded.match(re)
  return m ? m[1].trim() : null
}

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient()

    // ── Auth ─────────────────────────────────────────────────
    const { data: tokenRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'email_inbound_token')
      .maybeSingle()
    const expectedToken = tokenRow?.value ?? ''
    const presentedToken = req.nextUrl.searchParams.get('token') ?? ''
    if (!tokenMatches(presentedToken, expectedToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse the multipart payload ──────────────────────────
    const form = await req.formData()
    const field = (name: string): string | null => {
      const v = form.get(name)
      return typeof v === 'string' ? v : null
    }
    const fromRaw = field('from')
    const toRaw = field('to')
    const subject = field('subject') ?? '(no subject)'
    const text = field('text')
    const html = field('html')
    const rawHeaders = field('headers') ?? ''
    const attachmentInfo = field('attachment-info')

    const fromEmail = extractAddress(fromRaw)
    if (!fromEmail) {
      // Unparseable sender — acknowledge so SendGrid stops retrying.
      return NextResponse.json({ ok: true, unmatched: true })
    }

    // Loop guard: forwarded copies of our own outbound mail.
    try {
      const identity = await getEmailSenderIdentity()
      if (fromEmail === identity.fromEmail.toLowerCase()) {
        return NextResponse.json({ ok: true, skipped: 'own_outbound' })
      }
    } catch {
      // Identity not configured — nothing to guard against.
    }

    const messageId =
      headerValue(rawHeaders, 'Message-ID') ??
      headerValue(rawHeaders, 'Message-Id')
    const inReplyTo = headerValue(rawHeaders, 'In-Reply-To')
    const receivedAt = new Date().toISOString()

    // ── Worker match ─────────────────────────────────────────
    const { data: workers } = await admin
      .from('workers')
      .select('worker_id')
      .ilike('email', fromEmail)
    const workerId = ((workers ?? [])[0]?.worker_id as number | undefined) ?? null

    // ── Reply correlation (best effort) ──────────────────────
    let correlatedSend: {
      send_id: number
      campaign_id: number
      created_at: string
    } | null = null
    if (workerId != null) {
      const cutoff = new Date(
        Date.now() - REPLY_CORRELATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString()
      const { data: sends } = await admin
        .from('email_send_log')
        .select('send_id, campaign_id, created_at, replied_at, reply_count')
        .eq('worker_id', workerId)
        .eq('send_method', 'sendgrid')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
      const send = (sends ?? [])[0]
      if (send) {
        correlatedSend = {
          send_id: send.send_id as number,
          campaign_id: send.campaign_id as number,
          created_at: send.created_at as string,
        }
      }
    }

    // ── Conversation attach/create ───────────────────────────
    const withinRecentWindow =
      correlatedSend &&
      Date.parse(correlatedSend.created_at) >
        Date.now() - RECENT_SEND_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const campaignScope = withinRecentWindow ? correlatedSend!.campaign_id : null

    // Prefer an existing open thread for the address: campaign scope
    // first, else most recent.
    const { data: openConvs } = await admin
      .from('email_conversations')
      .select('conversation_id, campaign_id, last_message_at')
      .eq('email_address', fromEmail)
      .neq('state', 'closed')
    let conversationId: number | null = null
    if (openConvs && openConvs.length > 0) {
      const sorted = [...openConvs].sort((a, b) => {
        const aScope = a.campaign_id === campaignScope ? 0 : 1
        const bScope = b.campaign_id === campaignScope ? 0 : 1
        if (aScope !== bScope) return aScope - bScope
        const aT = a.last_message_at ? Date.parse(a.last_message_at as string) : 0
        const bT = b.last_message_at ? Date.parse(b.last_message_at as string) : 0
        return bT - aT
      })
      conversationId = sorted[0].conversation_id as number
    } else {
      const { data: created, error: convErr } = await admin
        .from('email_conversations')
        .insert({
          worker_id: workerId,
          email_address: fromEmail,
          campaign_id: campaignScope,
          subject: subject.slice(0, 500),
          state: workerId != null ? 'needs_response' : 'triage',
        })
        .select('conversation_id')
        .single()
      if (convErr) {
        if (convErr.code === UNIQUE_VIOLATION) {
          // Race, or a closed thread occupying the key: attach — the
          // touch RPC below flips closed → needs_response.
          let q = admin
            .from('email_conversations')
            .select('conversation_id')
            .eq('email_address', fromEmail)
          q =
            campaignScope == null
              ? q.is('campaign_id', null)
              : q.eq('campaign_id', campaignScope)
          const { data: existing } = await q.maybeSingle()
          conversationId =
            (existing?.conversation_id as number | undefined) ?? null
        } else {
          throw convErr
        }
      } else {
        conversationId = created.conversation_id as number
      }
    }

    // ── Message append (idempotent on Message-ID) ────────────
    let messageIsNew = false
    if (conversationId != null) {
      const messageRow = {
        conversation_id: conversationId,
        direction: 'inbound',
        subject: subject.slice(0, 500),
        body_text: text,
        body_html: html,
        from_email: fromEmail,
        to_email: extractAddress(toRaw),
        provider_message_id: messageId ? messageId.slice(0, 300) : null,
        in_reply_to: inReplyTo ? inReplyTo.slice(0, 300) : null,
        send_id: correlatedSend?.send_id ?? null,
        attachments: attachmentInfo
          ? (() => {
              try {
                return JSON.parse(attachmentInfo)
              } catch {
                return null
              }
            })()
          : null,
        status: 'received',
        created_at: receivedAt,
      }
      if (messageId) {
        const { data: msgIns, error: msgErr } = await admin
          .from('email_messages')
          .upsert(messageRow, {
            onConflict: 'provider_message_id',
            ignoreDuplicates: true,
          })
          .select('message_id')
        if (msgErr) {
          if (msgErr.code !== UNIQUE_VIOLATION) throw msgErr
        } else {
          messageIsNew = (msgIns?.length ?? 0) > 0
        }
      } else {
        const { error: msgErr } = await admin
          .from('email_messages')
          .insert(messageRow)
        if (msgErr) throw msgErr
        messageIsNew = true
      }

      if (messageIsNew) {
        const { error: touchErr } = await admin.rpc(
          'touch_email_conversation_inbound',
          {
            p_conversation_id: conversationId,
            p_occurred_at: receivedAt,
          },
        )
        if (touchErr) {
          console.error('touch_email_conversation_inbound failed:', touchErr)
        }
      }
    }

    // ── Reply stamps on the correlated send (new messages only) ──
    if (correlatedSend && messageIsNew && workerId != null) {
      const snippet = (text ?? '').trim().slice(0, 300) || null
      const { data: sendRow } = await admin
        .from('email_send_log')
        .select('send_id, replied_at, reply_count')
        .eq('send_id', correlatedSend.send_id)
        .maybeSingle()
      if (sendRow) {
        await admin
          .from('email_send_log')
          .update({
            reply_count: ((sendRow.reply_count as number) ?? 0) + 1,
            ...(sendRow.replied_at
              ? {}
              : { replied_at: receivedAt, reply_snippet: snippet }),
          })
          .eq('send_id', correlatedSend.send_id)
        await admin.from('email_engagement_events').insert({
          send_id: correlatedSend.send_id,
          event_type: 'replied',
          occurred_at: receivedAt,
          payload: { via: 'inbound_parse', message_id: messageId },
        })
        void tagWorkerReplied(workerId)
      }
    }

    if (conversationId == null && workerId == null) {
      return NextResponse.json({ ok: true, unmatched: true })
    }
    return NextResponse.json({
      ok: true,
      conversation_id: conversationId,
      deduplicated: !messageIsNew || undefined,
    })
  } catch (error) {
    console.error('Email inbound handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
