/**
 * SendGrid Inbound Parse webhook — the in-app leg of the hybrid inbox.
 *
 * The real mailbox (e.g. organise@offshore-alliance.au) stays the
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

function safeFilename(name: string): string {
  return (
    name
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 180) || 'attachment'
  )
}

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

/**
 * Parse the Inbound Parse POST robustly. SendGrid sends Content-Type
 * variants that undici's strict req.formData() rejects with
 * `Content-Type was not one of "multipart/form-data" or
 * "application/x-www-form-urlencoded"`. Read the raw bytes, recover the
 * multipart boundary (from the header, or sniffed from the body's first
 * line), and re-wrap with a canonical Content-Type before parsing.
 */
async function parseInboundForm(req: NextRequest): Promise<FormData> {
  const raw = Buffer.from(await req.arrayBuffer())
  const contentType = req.headers.get('content-type') ?? ''

  if (/application\/x-www-form-urlencoded/i.test(contentType)) {
    return new Response(raw, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }).formData()
  }

  let boundary =
    contentType.match(/boundary\s*=\s*"?([^";,]+)"?/i)?.[1]?.trim() ?? null
  if (!boundary && raw.subarray(0, 2).toString('latin1') === '--') {
    const nl = raw.indexOf('\r\n')
    const end = nl > 2 ? nl : raw.indexOf('\n')
    if (end > 2) boundary = raw.subarray(2, end).toString('utf8').trim()
  }
  if (!boundary) {
    throw new Error(
      `Unparseable inbound payload — content-type: "${contentType}", ` +
        `body starts with: ${JSON.stringify(raw.subarray(0, 80).toString('latin1'))}`,
    )
  }
  return new Response(raw, {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }).formData()
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
    const form = await parseInboundForm(req)
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
    const references = headerValue(rawHeaders, 'References')
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
    const threadIdentifiers = [
      inReplyTo,
      ...(references?.match(/<[^>]+>|[^\s]+/g) ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().slice(0, 300))
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 20)

    if (threadIdentifiers.length > 0) {
      const [rfcMatches, providerMatches] = await Promise.all([
        admin
          .from('email_messages')
          .select('send_id, rfc_message_id, provider_message_id')
          .in('rfc_message_id', threadIdentifiers)
          .not('send_id', 'is', null),
        admin
          .from('email_messages')
          .select('send_id, rfc_message_id, provider_message_id')
          .in('provider_message_id', threadIdentifiers)
          .not('send_id', 'is', null),
      ])
      if (rfcMatches.error) throw rfcMatches.error
      if (providerMatches.error) throw providerMatches.error
      const matches = [...(rfcMatches.data ?? []), ...(providerMatches.data ?? [])]
      const matchedMessage = matches.sort((a, b) => {
        const aId = (a.rfc_message_id || a.provider_message_id) as string
        const bId = (b.rfc_message_id || b.provider_message_id) as string
        return threadIdentifiers.indexOf(aId) - threadIdentifiers.indexOf(bId)
      })[0]
      if (matchedMessage?.send_id != null) {
        const { data: matchedSend, error: matchedSendError } = await admin
          .from('email_send_log')
          .select('send_id, campaign_id, created_at')
          .eq('send_id', matchedMessage.send_id)
          .maybeSingle()
        if (matchedSendError) throw matchedSendError
        if (matchedSend) {
          correlatedSend = {
            send_id: matchedSend.send_id as number,
            campaign_id: matchedSend.campaign_id as number,
            created_at: matchedSend.created_at as string,
          }
        }
      }
    }

    if (workerId != null && correlatedSend == null) {
      const cutoff = new Date(
        Date.now() - RECENT_SEND_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString()
      const { data: sends } = await admin
        .from('email_send_log')
        .select('send_id, campaign_id, created_at, replied_at, reply_count')
        .eq('worker_id', workerId)
        .in('send_method', [
          'sendgrid',
          'outlook_personalised',
          'outlook_bcc',
          'outlook_send_personalised',
          'outlook_send_bcc',
        ])
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

    // Reuse only the exact address + campaign scope. Falling back to another
    // campaign's open thread contaminates both campaign history and ownership.
    let existingConversationQuery = admin
      .from('email_conversations')
      .select('conversation_id')
      .eq('email_address', fromEmail)
    existingConversationQuery =
      campaignScope == null
        ? existingConversationQuery.is('campaign_id', null)
        : existingConversationQuery.eq('campaign_id', campaignScope)
    const { data: existingConversation, error: existingConversationError } =
      await existingConversationQuery.maybeSingle()
    if (existingConversationError) throw existingConversationError

    let conversationId: number | null =
      (existingConversation?.conversation_id as number | undefined) ?? null
    if (conversationId == null) {
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
          // A concurrent webhook created the exact scoped thread first.
          let q = admin
            .from('email_conversations')
            .select('conversation_id')
            .eq('email_address', fromEmail)
          q =
            campaignScope == null
              ? q.is('campaign_id', null)
              : q.eq('campaign_id', campaignScope)
          const { data: existing, error: raceLookupError } = await q.maybeSingle()
          if (raceLookupError) throw raceLookupError
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
    let insertedMessageId: number | null = null
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
        rfc_message_id: messageId ? messageId.slice(0, 300) : null,
        rfc_references: references ? references.slice(0, 2000) : null,
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
          insertedMessageId =
            (msgIns?.[0]?.message_id as number | undefined) ?? null
        }
        if (insertedMessageId == null) {
          const { data: existingMessage, error: existingMessageError } = await admin
            .from('email_messages')
            .select('message_id')
            .eq('provider_message_id', messageId.slice(0, 300))
            .maybeSingle()
          if (existingMessageError) throw existingMessageError
          insertedMessageId =
            (existingMessage?.message_id as number | undefined) ?? null
        }
      } else {
        const { data: inserted, error: msgErr } = await admin
          .from('email_messages')
          .insert(messageRow)
          .select('message_id')
          .single()
        if (msgErr) throw msgErr
        messageIsNew = true
        insertedMessageId = inserted.message_id as number
      }

      if (insertedMessageId != null && attachmentInfo) {
        let parsedInfo: Record<
          string,
          {
            filename?: string
            type?: string
            disposition?: string
            'content-id'?: string
          }
        > = {}
        try {
          parsedInfo = JSON.parse(attachmentInfo) as typeof parsedInfo
        } catch {
          parsedInfo = {}
        }
        for (const [fieldName, info] of Object.entries(parsedInfo)) {
          const value = form.get(fieldName)
          if (!(value instanceof File) || value.size === 0) continue
          const originalFilename = info.filename || value.name || 'attachment'
          const filename = safeFilename(originalFilename)
          const storagePath = `${conversationId}/${insertedMessageId}/${safeFilename(fieldName)}_${filename}`
          const bytes = Buffer.from(await value.arrayBuffer())
          const { error: uploadError } = await admin.storage
            .from('email-attachments')
            .upload(storagePath, bytes, {
              contentType: info.type || value.type || 'application/octet-stream',
              upsert: true,
            })
          if (uploadError) {
            throw uploadError
          }
          const { error: metadataError } = await admin
            .from('email_message_attachments')
            .upsert(
              {
                message_id: insertedMessageId,
                conversation_id: conversationId,
                storage_bucket: 'email-attachments',
                storage_path: storagePath,
                filename: originalFilename.slice(0, 255),
                content_type: info.type || value.type || null,
                byte_size: value.size,
                content_id: info['content-id'] || null,
                is_inline: info.disposition === 'inline',
              },
              {
                onConflict: 'storage_bucket,storage_path',
                ignoreDuplicates: true,
              },
            )
          if (metadataError) {
            await admin.storage.from('email-attachments').remove([storagePath])
            throw metadataError
          }
        }
      }

    }

    // Claim the per-message workflow so webhook retries and Graph polling can
    // safely converge without duplicating unread counts, reply stamps or tags.
    if (insertedMessageId != null && conversationId != null) {
      const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString()
      const { data: claimed, error: claimError } = await admin
        .from('email_messages')
        .update({
          reply_workflow_processing_started_at: new Date().toISOString(),
          reply_workflow_error: null,
        })
        .eq('message_id', insertedMessageId)
        .is('reply_workflow_processed_at', null)
        .or(
          `reply_workflow_processing_started_at.is.null,reply_workflow_processing_started_at.lt.${staleBefore}`,
        )
        .select('message_id')
      if (claimError) throw claimError

      if ((claimed?.length ?? 0) > 0) {
        try {
          if (correlatedSend && workerId != null) {
            const snippet = (text ?? '').trim().slice(0, 300) || null
            const { data: sendRow, error: sendLookupError } = await admin
              .from('email_send_log')
              .select('send_id, replied_at, reply_count')
              .eq('send_id', correlatedSend.send_id)
              .maybeSingle()
            if (sendLookupError) throw sendLookupError
            if (sendRow) {
              const sourceMessageId =
                messageId?.slice(0, 300) ?? `inbound:${insertedMessageId}`
              const { error: engagementError } = await admin
                .from('email_engagement_events')
                .insert({
                  send_id: correlatedSend.send_id,
                  event_type: 'replied',
                  occurred_at: receivedAt,
                  source_message_id: sourceMessageId,
                  payload: { via: 'inbound_parse', message_id: messageId },
                })
              if (engagementError && engagementError.code !== UNIQUE_VIOLATION) {
                throw engagementError
              }
              const { count: replyCount, error: countError } = await admin
                .from('email_engagement_events')
                .select('event_id', { count: 'exact', head: true })
                .eq('send_id', correlatedSend.send_id)
                .eq('event_type', 'replied')
              if (countError) throw countError
              const { error: sendUpdateError } = await admin
                .from('email_send_log')
                .update({
                  reply_count: replyCount ?? 1,
                  ...(sendRow.replied_at
                    ? {}
                    : { replied_at: receivedAt, reply_snippet: snippet }),
                })
                .eq('send_id', correlatedSend.send_id)
              if (sendUpdateError) throw sendUpdateError
              await tagWorkerReplied(workerId)
            }
          }

          const { error: completeError } = await admin.rpc(
            'complete_email_reply_workflow',
            {
              p_message_id: insertedMessageId,
              p_occurred_at: receivedAt,
            },
          )
          if (completeError) throw completeError
        } catch (workflowError) {
          await admin
            .from('email_messages')
            .update({
              reply_workflow_processing_started_at: null,
              reply_workflow_error: (
                workflowError instanceof Error
                  ? workflowError.message
                  : String(workflowError)
              ).slice(0, 2000),
            })
            .eq('message_id', insertedMessageId)
            .is('reply_workflow_processed_at', null)
          throw workflowError
        }
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
