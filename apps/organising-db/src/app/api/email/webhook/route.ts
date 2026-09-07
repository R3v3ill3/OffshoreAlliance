/**
 * SendGrid Event Webhook endpoint (clone of the SMS webhook's
 * auth/idempotency discipline).
 *
 * Auth (either passes):
 *   - Signed Event Webhook ECDSA signature via provider.verifyWebhook
 *     (X-Twilio-Email-Event-Webhook-Signature/-Timestamp) when the
 *     verification key is configured, OR
 *   - Shared-secret query param ?token= matched against
 *     app_settings.email_webhook_token (seeded by the migration).
 *   The mock provider's verifyWebhook always returns true, so it is
 *   deliberately NOT consulted — mock/unconfigured setups must present
 *   the token.
 *
 * Dispatch (all handlers idempotent — SendGrid delivers at-least-once,
 * out of order; sg_event_id is the dedupe key in email_delivery_events):
 *   - delivered   → email_send_log.delivered_at + monotonic
 *                   email_list_items sent → delivered + counter recount.
 *   - bounce      → bounced_at/bounce_reason, item → bounced,
 *                   workers.email_status = 'invalid' (hard bounce skip),
 *                   'bounced' engagement event.
 *   - dropped     → item → failed (suppression-list drop — address may
 *                   be fine; do NOT invalidate the worker's email).
 *   - spamreport  → workers.email_opt_out (source 'spam_report') +
 *                   'spam_report' engagement event.
 *   - unsubscribe → workers.email_opt_out (source 'unsubscribe_link') +
 *                   unsubscribed_at + 'unsubscribed' engagement event.
 *   - open/click  → atomic first/counter RPCs + engagement events.
 *
 * Correlation: custom_args.send_id (set by the dispatcher) first; else
 * the first dot-segment of sg_message_id matches the stored
 * provider_message_id (the X-Message-Id returned at send time).
 */

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEmailProvider, type EmailWebhookEvent } from '@/lib/email/provider'
import { markEmailBounced } from '@/lib/comms/send-log'

export const dynamic = 'force-dynamic'

const UNIQUE_VIOLATION = '23505'

/** Constant-time shared-token comparison (length-guarded). */
function tokenMatches(presented: string, expected: string): boolean {
  if (!presented || !expected) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** First dot-segment of sg_message_id = the X-Message-Id at send time. */
function baseMessageId(sgMessageId: string | null): string | null {
  if (!sgMessageId) return null
  const base = sgMessageId.split('.')[0]
  return base || null
}

type AdminClient = ReturnType<typeof createAdminClient>

async function requireSuccess<T extends { error: unknown }>(
  operation: PromiseLike<T>,
): Promise<T> {
  const result = await operation
  if (result.error) throw result.error
  return result
}

async function requireSuccessOrDuplicate<
  T extends { error: { code?: string } | null },
>(operation: PromiseLike<T>): Promise<T> {
  const result = await operation
  if (result.error && result.error.code !== UNIQUE_VIOLATION) throw result.error
  return result
}

interface DeliveryEventClaim {
  eventId: number | null
  shouldProcess: boolean
}

interface DeliveryEventRow {
  event_id: number
  processed_at: string | null
}

/** Persist and atomically claim an event until all side effects complete. */
async function claimDeliveryEvent(
  admin: AdminClient,
  event: EmailWebhookEvent,
  sendId: number | null,
  emailMessageId: number | null,
): Promise<DeliveryEventClaim> {
  if (!event.providerEventId) return { eventId: null, shouldProcess: true }
  const { data, error } = await admin
    .from('email_delivery_events')
    .upsert(
      {
        provider_event_id: event.providerEventId,
        provider_message_id: event.providerMessageId,
        send_id: sendId,
        email_message_id: emailMessageId,
        event_type: event.type,
        payload: event.raw ?? null,
        occurred_at: event.occurredAt ?? new Date().toISOString(),
      },
      { onConflict: 'provider_event_id', ignoreDuplicates: true },
    )
    .select('event_id, processed_at')
  if (error) {
    if (error.code !== UNIQUE_VIOLATION) throw error
  }
  let row: DeliveryEventRow | undefined = data?.[0] as
    | DeliveryEventRow
    | undefined
  if (!row) {
    const { data: existing, error: lookupError } = await admin
      .from('email_delivery_events')
      .select('event_id, processed_at')
      .eq('provider_event_id', event.providerEventId)
      .maybeSingle()
    if (lookupError) throw lookupError
    row = (existing as DeliveryEventRow | null) ?? undefined
  }
  if (!row || row.processed_at) {
    return { eventId: row?.event_id ?? null, shouldProcess: false }
  }

  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: claimed, error: claimError } = await admin
    .from('email_delivery_events')
    .update({
      processing_started_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq('event_id', row.event_id)
    .is('processed_at', null)
    .or(
      `processing_started_at.is.null,processing_started_at.lt.${staleBefore}`,
    )
    .select('event_id')
  if (claimError) throw claimError
  return {
    eventId: row.event_id,
    shouldProcess: (claimed?.length ?? 0) > 0,
  }
}

interface InboxMessageRow {
  message_id: number
  status: string
}

async function resolveInboxMessage(
  admin: AdminClient,
  event: EmailWebhookEvent,
): Promise<InboxMessageRow | null> {
  const base = baseMessageId(event.providerMessageId)
  if (!base) return null
  const { data, error } = await admin
    .from('email_messages')
    .select('message_id, status')
    .eq('provider_message_id', base)
    .eq('direction', 'outbound')
    .maybeSingle()
  if (error) throw error
  return (data as InboxMessageRow | null) ?? null
}

interface SendRow {
  send_id: number
  worker_id: number
  delivered_at: string | null
  bounced_at: string | null
  unsubscribed_at: string | null
}

async function resolveSendRow(
  admin: AdminClient,
  event: EmailWebhookEvent,
): Promise<SendRow | null> {
  if (event.sendId != null) {
    const { data, error } = await admin
      .from('email_send_log')
      .select('send_id, worker_id, delivered_at, bounced_at, unsubscribed_at')
      .eq('send_id', event.sendId)
      .maybeSingle()
    if (error) throw error
    if (data) return data as SendRow
  }
  const base = baseMessageId(event.providerMessageId)
  if (base) {
    const { data, error } = await admin
      .from('email_send_log')
      .select('send_id, worker_id, delivered_at, bounced_at, unsubscribed_at')
      .eq('provider_message_id', base)
      .maybeSingle()
    if (error) throw error
    if (data) return data as SendRow
  }
  return null
}

/** Recount a list's counters after item transitions (idempotent). */
async function recountListCounters(
  admin: AdminClient,
  listId: number,
): Promise<void> {
  const countStatus = async (statuses: string[]): Promise<number> => {
    const { count, error } = await admin
      .from('email_list_items')
      .select('item_id', { count: 'exact', head: true })
      .eq('list_id', listId)
      .in('status', statuses)
    if (error) throw error
    return count ?? 0
  }
  const [sent, delivered, failed, bounced] = await Promise.all([
    countStatus(['sent']),
    countStatus(['delivered']),
    countStatus(['failed']),
    countStatus(['bounced']),
  ])
  const { error } = await admin
    .from('email_lists')
    .update({
      sent_items: sent + delivered + failed + bounced,
      delivered_items: delivered,
      failed_items: failed + bounced,
    })
    .eq('list_id', listId)
  if (error) throw error
}

/** Monotonic item transition keyed on the stored X-Message-Id. */
async function transitionItems(
  admin: AdminClient,
  event: EmailWebhookEvent,
  updates: Record<string, unknown>,
): Promise<void> {
  const base = baseMessageId(event.providerMessageId)
  if (!base) return
  const { data: transitioned, error } = await admin
    .from('email_list_items')
    .update(updates)
    .eq('provider_message_id', base)
    .eq('status', 'sent')
    .select('list_id')
  if (error) throw error
  let listIds = [...new Set((transitioned ?? []).map((r) => r.list_id as number))]
  if (listIds.length === 0) {
    const { data: existing, error: lookupError } = await admin
      .from('email_list_items')
      .select('list_id')
      .eq('provider_message_id', base)
    if (lookupError) throw lookupError
    listIds = [...new Set((existing ?? []).map((row) => row.list_id as number))]
  }
  for (const listId of listIds) {
    await recountListCounters(admin, listId)
  }
}

async function recountEngagement(
  admin: AdminClient,
  sendId: number,
  eventType: 'opened' | 'clicked',
): Promise<void> {
  const [{ count, error: countError }, { data: first, error: firstError }] =
    await Promise.all([
      admin
        .from('email_engagement_events')
        .select('event_id', { count: 'exact', head: true })
        .eq('send_id', sendId)
        .eq('event_type', eventType),
      admin
        .from('email_engagement_events')
        .select('occurred_at')
        .eq('send_id', sendId)
        .eq('event_type', eventType)
        .order('occurred_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])
  if (countError) throw countError
  if (firstError) throw firstError
  const updates =
    eventType === 'opened'
      ? { open_count: count ?? 0, first_open_at: first?.occurred_at ?? null }
      : { click_count: count ?? 0, first_click_at: first?.occurred_at ?? null }
  await requireSuccess(
    admin.from('email_send_log').update(updates).eq('send_id', sendId),
  )
}

export async function POST(req: NextRequest) {
  let processingEventId: number | null = null
  let processingAdmin: AdminClient | null = null
  try {
    const rawBody = await req.text()
    const provider = await getEmailProvider()
    const admin = createAdminClient()
    processingAdmin = admin

    // ── Auth ─────────────────────────────────────────────────
    const { data: tokenRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'email_webhook_token')
      .maybeSingle()
    const expectedToken = tokenRow?.value ?? ''
    const presentedToken = req.nextUrl.searchParams.get('token') ?? ''
    let authorised = tokenMatches(presentedToken, expectedToken)
    if (!authorised && provider.name === 'sendgrid') {
      const headers: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
      })
      authorised = provider.verifyWebhook(rawBody, headers)
    }
    if (!authorised) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse + dispatch ─────────────────────────────────────
    const events = provider.parseWebhookEvents(rawBody)
    const summary = { received: events.length, processed: 0, deduplicated: 0 }

    for (const event of events) {
      if (event.type === 'unknown' || event.type === 'processed' || event.type === 'deferred') {
        // Acknowledged but not actioned (processed/deferred are
        // intermediate states; item stays 'sent' until terminal).
        continue
      }

      const [sendRow, inboxMessage] = await Promise.all([
        resolveSendRow(admin, event),
        resolveInboxMessage(admin, event),
      ])
      const claim = await claimDeliveryEvent(
        admin,
        event,
        sendRow?.send_id ?? null,
        inboxMessage?.message_id ?? null,
      )
      if (!claim.shouldProcess) {
        summary.deduplicated += 1
        continue
      }
      processingEventId = claim.eventId
      const occurredAt = event.occurredAt ?? new Date().toISOString()

      if (event.type === 'delivered') {
        if (sendRow && !sendRow.delivered_at) {
          await requireSuccess(
            admin
              .from('email_send_log')
              .update({ delivered_at: occurredAt })
              .eq('send_id', sendRow.send_id)
              .is('delivered_at', null),
          )
        }
        await transitionItems(admin, event, {
          status: 'delivered',
          delivered_at: occurredAt,
        })
        if (inboxMessage?.status === 'sent') {
          await requireSuccess(
            admin
              .from('email_messages')
              .update({ status: 'delivered', delivered_at: occurredAt, error: null })
              .eq('message_id', inboxMessage.message_id)
              .eq('status', 'sent'),
          )
        }
      } else if (event.type === 'bounce' || event.type === 'dropped') {
        const reason =
          event.reason ??
          (event.type === 'dropped' ? 'Dropped by provider' : 'Bounced')
        if (sendRow) {
          await requireSuccess(
            admin
              .from('email_send_log')
              .update({ bounced_at: occurredAt, bounce_reason: reason })
              .eq('send_id', sendRow.send_id)
              .is('bounced_at', null),
          )
          await requireSuccessOrDuplicate(
            admin.from('email_engagement_events').insert({
              send_id: sendRow.send_id,
              event_type: 'bounced',
              occurred_at: occurredAt,
              source_message_id: event.providerEventId,
              payload: { reason, provider_event: event.type },
            }),
          )
          // Hard bounce = the address is bad → deliverability flag.
          // 'dropped' is usually a suppression-list hit, not proof the
          // address is invalid — leave email_status alone for those.
          if (event.type === 'bounce') {
            await markEmailBounced(sendRow.worker_id, reason)
          }
        }
        await transitionItems(admin, event, {
          status: event.type === 'bounce' ? 'bounced' : 'failed',
          failure_reason: reason,
        })
        if (inboxMessage?.status === 'sent') {
          await requireSuccess(
            admin
              .from('email_messages')
              .update({ status: 'failed', error: reason })
              .eq('message_id', inboxMessage.message_id)
              .eq('status', 'sent'),
          )
        }
      } else if (event.type === 'spam_report' || event.type === 'unsubscribe') {
        const source =
          event.type === 'spam_report' ? 'spam_report' : 'unsubscribe_link'
        if (sendRow) {
          await requireSuccess(
            admin
              .from('workers')
              .update({
                email_opt_out: true,
                email_opt_out_at: occurredAt,
                email_opt_out_source: source,
              })
              .eq('worker_id', sendRow.worker_id)
              .eq('email_opt_out', false),
          )
          await requireSuccess(
            admin
              .from('email_send_log')
              .update({ unsubscribed_at: occurredAt })
              .eq('send_id', sendRow.send_id)
              .is('unsubscribed_at', null),
          )
          await requireSuccessOrDuplicate(
            admin.from('email_engagement_events').insert({
              send_id: sendRow.send_id,
              event_type:
                event.type === 'spam_report' ? 'spam_report' : 'unsubscribed',
              occurred_at: occurredAt,
              source_message_id: event.providerEventId,
              payload: { provider_event: event.type },
            }),
          )
          // Screen out of any still-pending sends immediately.
          await requireSuccess(
            admin
              .from('email_list_items')
              .update({
                status: 'unsubscribed',
                send_status_detail:
                  event.type === 'spam_report'
                    ? 'Marked as spam'
                    : 'Unsubscribed at provider',
              })
              .eq('worker_id', sendRow.worker_id)
              .in('status', ['pending', 'queued']),
          )
        }
      } else if (event.type === 'open') {
        if (sendRow) {
          await requireSuccessOrDuplicate(
            admin
              .from('email_engagement_events')
              .insert({
                send_id: sendRow.send_id,
                event_type: 'opened',
                occurred_at: occurredAt,
                source_message_id: event.providerEventId,
                payload: null,
              })
              .select('event_id'),
          )
          await recountEngagement(admin, sendRow.send_id, 'opened')
        }
      } else if (event.type === 'click') {
        if (sendRow) {
          await requireSuccessOrDuplicate(
            admin
              .from('email_engagement_events')
              .insert({
                send_id: sendRow.send_id,
                event_type: 'clicked',
                occurred_at: occurredAt,
                source_message_id: event.providerEventId,
                payload: { url: event.url },
              })
              .select('event_id'),
          )
          await recountEngagement(admin, sendRow.send_id, 'clicked')
        }
      }

      if (processingEventId != null) {
        const { error: completeError } = await admin
          .from('email_delivery_events')
          .update({
            processed_at: new Date().toISOString(),
            processing_started_at: null,
            processing_error: null,
          })
          .eq('event_id', processingEventId)
        if (completeError) throw completeError
      }
      processingEventId = null
      summary.processed += 1
    }

    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    if (processingAdmin && processingEventId != null) {
      await processingAdmin
        .from('email_delivery_events')
        .update({
          processing_started_at: null,
          processing_error: (
            error instanceof Error ? error.message : String(error)
          ).slice(0, 2000),
        })
        .eq('event_id', processingEventId)
        .is('processed_at', null)
    }
    console.error('Email webhook handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
