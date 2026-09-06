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
  internetMessageId: string | null
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

interface GraphMessagesResult {
  messages: GraphMessageEnvelope[]
  scannedThrough: string | null
  truncated: boolean
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
): Promise<GraphMessagesResult> {
  const since_iso = since.toISOString()
  const filter = `receivedDateTime ge ${since_iso} and isDraft eq false`
  const select =
    'id,conversationId,internetMessageId,subject,bodyPreview,receivedDateTime,isDraft,from,toRecipients,body'
  let url: string | undefined =
    `${MICROSOFT_GRAPH_BASE}/me/messages` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$select=${encodeURIComponent(select)}` +
    `&$top=100` +
    `&$orderby=${encodeURIComponent('receivedDateTime asc')}`

  const all: GraphMessageEnvelope[] = []
  let pages = 0
  let scannedThrough: string | null = null

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
      scannedThrough = msg.receivedDateTime
      // Skip messages sent by the organiser themselves (their own outgoing).
      if (
        msg.from.emailAddress.address.toLowerCase() ===
        organizerEmailAddress.toLowerCase()
      ) {
        continue
      }
      all.push(msg)
      if (all.length >= MAX_MESSAGES_PER_POLL) {
        return { messages: all, scannedThrough, truncated: true }
      }
    }
    url = page['@odata.nextLink']
    pages++
    if (pages > 10) {
      return { messages: all, scannedThrough, truncated: Boolean(url) }
    }
  }

  return { messages: all, scannedThrough, truncated: Boolean(url) }
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

async function mirrorGraphReplyToInbox(
  admin: ReturnType<typeof createAdminClient>,
  msg: GraphMessageEnvelope,
  sendRow: {
    send_id: number
    worker_id: number
    campaign_id: number
    recipient_email: string
  },
): Promise<number | null> {
  const emailAddress = sendRow.recipient_email.toLowerCase()
  let { data: conversation } = await admin
    .from('email_conversations')
    .select('conversation_id')
    .eq('email_address', emailAddress)
    .eq('campaign_id', sendRow.campaign_id)
    .maybeSingle()

  if (!conversation) {
    const { data: created, error } = await admin
      .from('email_conversations')
      .insert({
        worker_id: sendRow.worker_id,
        email_address: emailAddress,
        campaign_id: sendRow.campaign_id,
        subject: msg.subject.slice(0, 500),
        original_subject: msg.subject.slice(0, 500),
        graph_conversation_id: msg.conversationId,
        state: 'needs_response',
      })
      .select('conversation_id')
      .maybeSingle()
    if (error?.code === '23505') {
      const existing = await admin
        .from('email_conversations')
        .select('conversation_id')
        .eq('email_address', emailAddress)
        .eq('campaign_id', sendRow.campaign_id)
        .maybeSingle()
      conversation = existing.data
    } else if (error) {
      throw error
    } else {
      conversation = created
    }
  } else {
    await admin
      .from('email_conversations')
      .update({
        graph_conversation_id: msg.conversationId,
        worker_id: sendRow.worker_id,
      })
      .eq('conversation_id', conversation.conversation_id)
  }
  if (!conversation) return null

  const providerMessageId =
    msg.internetMessageId?.slice(0, 300) || `graph:${msg.id}`.slice(0, 300)
  const html =
    msg.body?.contentType?.toLowerCase() === 'html' ? msg.body.content : null
  const text =
    msg.body?.contentType?.toLowerCase() === 'text'
      ? msg.body.content
      : msg.bodyPreview
  const { data: inserted, error: messageError } = await admin
    .from('email_messages')
    .upsert(
      {
        conversation_id: conversation.conversation_id,
        direction: 'inbound',
        subject: msg.subject.slice(0, 500),
        body_text: text,
        body_html: html,
        from_email: msg.from.emailAddress.address.toLowerCase(),
        to_email: msg.toRecipients[0]?.emailAddress.address?.toLowerCase() ?? null,
        provider_message_id: providerMessageId,
        rfc_message_id: msg.internetMessageId?.slice(0, 300) ?? null,
        graph_message_id: msg.id,
        send_id: sendRow.send_id,
        status: 'received',
        created_at: msg.receivedDateTime,
      },
      { onConflict: 'provider_message_id', ignoreDuplicates: true },
    )
    .select('message_id')
  if (messageError && messageError.code !== '23505') throw messageError
  let messageId = (inserted?.[0]?.message_id as number | undefined) ?? null
  if (messageId == null) {
    let existingMessageQuery = admin
      .from('email_messages')
      .select('message_id')
      .eq('conversation_id', conversation.conversation_id)
    existingMessageQuery = msg.internetMessageId
      ? existingMessageQuery.eq('rfc_message_id', msg.internetMessageId.slice(0, 300))
      : existingMessageQuery.eq('provider_message_id', providerMessageId)
    const { data: existingMessage, error: existingMessageError } =
      await existingMessageQuery.maybeSingle()
    if (existingMessageError) throw existingMessageError
    messageId = (existingMessage?.message_id as number | undefined) ?? null
    if (messageId != null) {
      const { error: graphIdError } = await admin
        .from('email_messages')
        .update({ graph_message_id: msg.id })
        .eq('message_id', messageId)
        .is('graph_message_id', null)
      if (graphIdError && graphIdError.code !== '23505') throw graphIdError
    }
  }
  return messageId
}

async function claimGraphReplyWorkflow(
  admin: ReturnType<typeof createAdminClient>,
  messageId: number,
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data, error } = await admin
    .from('email_messages')
    .update({
      reply_workflow_processing_started_at: new Date().toISOString(),
      reply_workflow_error: null,
    })
    .eq('message_id', messageId)
    .is('reply_workflow_processed_at', null)
    .or(
      `reply_workflow_processing_started_at.is.null,reply_workflow_processing_started_at.lt.${staleBefore}`,
    )
    .select('message_id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

async function completeGraphReplyWorkflow(
  admin: ReturnType<typeof createAdminClient>,
  messageId: number,
  occurredAt: string,
): Promise<void> {
  const { error } = await admin.rpc('complete_email_reply_workflow', {
    p_message_id: messageId,
    p_occurred_at: occurredAt,
  })
  if (error) throw error
}

async function releaseGraphReplyWorkflow(
  admin: ReturnType<typeof createAdminClient>,
  messageId: number,
  error: unknown,
): Promise<void> {
  await admin
    .from('email_messages')
    .update({
      reply_workflow_processing_started_at: null,
      reply_workflow_error:
        (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    })
    .eq('message_id', messageId)
    .is('reply_workflow_processed_at', null)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Validate cron secret.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[poll-mailbox] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Cron authentication is not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    let graphResult: GraphMessagesResult
    try {
      graphResult = await fetchGraphMessages(
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
    const { messages } = graphResult

    let repliesFound = 0
    let bouncesFound = 0
    let earliestFailedAt: string | null = null

    for (const msg of messages) {
      let workflowMessageId: number | null = null
      try {
        if (isDsnMessage(msg)) {
          // Bounce handling.
          const addrs = extractBouncedAddresses(msg)
          for (const addr of addrs) {
            // Match against recent send logs for this user.
            const { data: sendRow, error: sendLookupError } = await admin
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
            if (sendLookupError) throw sendLookupError

            if (!sendRow) continue

            const bounceReason = (msg.subject ?? '').slice(0, 280)
            await markEmailBounced(sendRow.worker_id as number, bounceReason)
            const { error: bounceEventError } = await admin
              .from('email_engagement_events')
              .insert({
              send_id: sendRow.send_id,
              event_type: 'bounced',
              occurred_at: msg.receivedDateTime,
              source_message_id: msg.id,
              payload: { subject: msg.subject, from: msg.from.emailAddress.address },
            })
            if (bounceEventError && bounceEventError.code !== '23505') {
              throw bounceEventError
            }
            const { error: bounceUpdateError } = await admin
              .from('email_send_log')
              .update({
                bounced_at: msg.receivedDateTime,
                bounce_reason: bounceReason,
              })
              .eq('send_id', sendRow.send_id)
            if (bounceUpdateError) throw bounceUpdateError
            bouncesFound++
          }
          continue
        }

        // Reply handling — match by conversationId.
        if (!msg.conversationId) continue

        const { data: sendRow, error: sendLookupError } = await admin
          .from('email_send_log')
          .select(
            'send_id, worker_id, campaign_id, recipient_email, replied_at, reply_count, first_reply_message_id',
          )
          .eq('conversation_id', msg.conversationId)
          .ilike('recipient_email', msg.from.emailAddress.address)
          .limit(1)
          .maybeSingle()
        if (sendLookupError) throw sendLookupError

        if (!sendRow) continue

        // Mirror the Graph reply into the same campaign-aware in-app thread
        // used by SendGrid Inbound Parse. internetMessageId is the shared
        // idempotency key when both ingestion paths observe the same email.
        workflowMessageId = await mirrorGraphReplyToInbox(admin, msg, {
          send_id: sendRow.send_id as number,
          worker_id: sendRow.worker_id as number,
          campaign_id: sendRow.campaign_id as number,
          recipient_email: sendRow.recipient_email as string,
        })
        if (
          workflowMessageId == null ||
          !(await claimGraphReplyWorkflow(admin, workflowMessageId))
        ) {
          continue
        }

        // Persist a source-keyed event first. Reply counts are derived from
        // this idempotent log, so a retry after a partial failure cannot
        // increment the send twice.
        const { error: engagementError } = await admin
          .from('email_engagement_events')
          .insert({
          send_id: sendRow.send_id,
          event_type: 'replied',
          occurred_at: msg.receivedDateTime,
          source_message_id: msg.id,
          payload: {
            message_id: msg.id,
            from: msg.from.emailAddress.address,
            snippet: msg.bodyPreview.slice(0, 280),
          },
        })
        if (engagementError && engagementError.code !== '23505') {
          throw engagementError
        }
        const { count: replyCount, error: replyCountError } = await admin
          .from('email_engagement_events')
          .select('event_id', { count: 'exact', head: true })
          .eq('send_id', sendRow.send_id)
          .eq('event_type', 'replied')
        if (replyCountError) throw replyCountError

        if ((replyCount ?? 0) <= 1) {
          // First reply.
          const snippet = msg.bodyPreview.slice(0, 280)
          const outlookLink = `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(msg.id)}`
          const { error: noteError } = await admin.from('worker_notes').insert({
            worker_id: sendRow.worker_id,
            campaign_id: sendRow.campaign_id,
            email_message_id: workflowMessageId,
            note_text: `Reply received: "${snippet}"\n\n${outlookLink}`,
            flag_for_follow_up: false,
          })
          if (noteError && noteError.code !== '23505') throw noteError

          const { error: firstReplyError } = await admin
            .from('email_send_log')
            .update({
              replied_at: msg.receivedDateTime,
              reply_snippet: snippet,
              first_reply_message_id: msg.id,
              latest_reply_message_id: msg.id,
              reply_count: replyCount ?? 1,
            })
            .eq('send_id', sendRow.send_id)
          if (firstReplyError) throw firstReplyError

          await tagWorkerReplied(sendRow.worker_id as number)
        } else {
          // Subsequent reply — bump count and update latest message id.
          const { error: subsequentReplyError } = await admin
            .from('email_send_log')
            .update({
              latest_reply_message_id: msg.id,
              reply_count: replyCount ?? ((sendRow.reply_count as number) ?? 0),
            })
            .eq('send_id', sendRow.send_id)
          if (subsequentReplyError) throw subsequentReplyError
        }

        await completeGraphReplyWorkflow(
          admin,
          workflowMessageId,
          msg.receivedDateTime,
        )
        workflowMessageId = null
        repliesFound++
      } catch (msgErr) {
        console.error('[poll-mailbox] message processing error:', msgErr)
        if (workflowMessageId != null) {
          await releaseGraphReplyWorkflow(admin, workflowMessageId, msgErr)
        }
        if (
          earliestFailedAt == null ||
          Date.parse(msg.receivedDateTime) < Date.parse(earliestFailedAt)
        ) {
          earliestFailedAt = msg.receivedDateTime
        }
      }
    }

    // Move only through messages Graph actually returned. On a per-message
    // failure, leave the cursor at that message so the one-minute overlap
    // retries it; idempotency prevents already-completed work from repeating.
    const nextCursor =
      earliestFailedAt ??
      graphResult.scannedThrough ??
      (graphResult.truncated
        ? (conn.last_polled_at as string | null)
        : new Date().toISOString())
    await admin
      .from('user_oauth_connections')
      .update({ last_polled_at: nextCursor })
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
