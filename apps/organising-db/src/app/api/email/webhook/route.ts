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

/**
 * Insert a delivery-event row; returns true when the row is new (the
 * caller should apply side effects) and false on redelivery. Any error
 * other than a unique violation is THROWN so the handler returns 500 —
 * SendGrid retries and the event is not silently lost.
 */
async function insertDeliveryEvent(
  admin: AdminClient,
  event: EmailWebhookEvent,
  sendId: number | null,
): Promise<boolean> {
  if (!event.providerEventId) return true // no dedupe handle — process it
  const { data, error } = await admin
    .from('email_delivery_events')
    .upsert(
      {
        provider_event_id: event.providerEventId,
        provider_message_id: event.providerMessageId,
        send_id: sendId,
        event_type: event.type,
        payload: event.raw ?? null,
        occurred_at: event.occurredAt ?? new Date().toISOString(),
      },
      { onConflict: 'provider_event_id', ignoreDuplicates: true },
    )
    .select('event_id')
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false
    throw error
  }
  return (data?.length ?? 0) > 0
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
    const { data } = await admin
      .from('email_send_log')
      .select('send_id, worker_id, delivered_at, bounced_at, unsubscribed_at')
      .eq('send_id', event.sendId)
      .maybeSingle()
    if (data) return data as SendRow
  }
  const base = baseMessageId(event.providerMessageId)
  if (base) {
    const { data } = await admin
      .from('email_send_log')
      .select('send_id, worker_id, delivered_at, bounced_at, unsubscribed_at')
      .eq('provider_message_id', base)
      .maybeSingle()
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
    const { count } = await admin
      .from('email_list_items')
      .select('item_id', { count: 'exact', head: true })
      .eq('list_id', listId)
      .in('status', statuses)
    return count ?? 0
  }
  const [sent, delivered, failed, bounced] = await Promise.all([
    countStatus(['sent']),
    countStatus(['delivered']),
    countStatus(['failed']),
    countStatus(['bounced']),
  ])
  await admin
    .from('email_lists')
    .update({
      sent_items: sent + delivered + failed + bounced,
      delivered_items: delivered,
      failed_items: failed + bounced,
    })
    .eq('list_id', listId)
}

/** Monotonic item transition keyed on the stored X-Message-Id. */
async function transitionItems(
  admin: AdminClient,
  event: EmailWebhookEvent,
  updates: Record<string, unknown>,
): Promise<void> {
  const base = baseMessageId(event.providerMessageId)
  if (!base) return
  const { data: transitioned } = await admin
    .from('email_list_items')
    .update(updates)
    .eq('provider_message_id', base)
    .eq('status', 'sent')
    .select('list_id')
  const listIds = [...new Set((transitioned ?? []).map((r) => r.list_id as number))]
  for (const listId of listIds) {
    await recountListCounters(admin, listId)
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const provider = await getEmailProvider()
    const admin = createAdminClient()

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

      const sendRow = await resolveSendRow(admin, event)
      const isNew = await insertDeliveryEvent(admin, event, sendRow?.send_id ?? null)
      if (!isNew) {
        summary.deduplicated += 1
        continue
      }
      const occurredAt = event.occurredAt ?? new Date().toISOString()

      if (event.type === 'delivered') {
        if (sendRow && !sendRow.delivered_at) {
          await admin
            .from('email_send_log')
            .update({ delivered_at: occurredAt })
            .eq('send_id', sendRow.send_id)
            .is('delivered_at', null)
        }
        await transitionItems(admin, event, {
          status: 'delivered',
          delivered_at: occurredAt,
        })
      } else if (event.type === 'bounce' || event.type === 'dropped') {
        const reason =
          event.reason ??
          (event.type === 'dropped' ? 'Dropped by provider' : 'Bounced')
        if (sendRow) {
          await admin
            .from('email_send_log')
            .update({ bounced_at: occurredAt, bounce_reason: reason })
            .eq('send_id', sendRow.send_id)
            .is('bounced_at', null)
          await admin.from('email_engagement_events').insert({
            send_id: sendRow.send_id,
            event_type: 'bounced',
            occurred_at: occurredAt,
            payload: { reason, provider_event: event.type },
          })
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
      } else if (event.type === 'spam_report' || event.type === 'unsubscribe') {
        const source =
          event.type === 'spam_report' ? 'spam_report' : 'unsubscribe_link'
        if (sendRow) {
          await admin
            .from('workers')
            .update({
              email_opt_out: true,
              email_opt_out_at: occurredAt,
              email_opt_out_source: source,
            })
            .eq('worker_id', sendRow.worker_id)
            .eq('email_opt_out', false)
          await admin
            .from('email_send_log')
            .update({ unsubscribed_at: occurredAt })
            .eq('send_id', sendRow.send_id)
            .is('unsubscribed_at', null)
          await admin.from('email_engagement_events').insert({
            send_id: sendRow.send_id,
            event_type:
              event.type === 'spam_report' ? 'spam_report' : 'unsubscribed',
            occurred_at: occurredAt,
            payload: { provider_event: event.type },
          })
          // Screen out of any still-pending sends immediately.
          await admin
            .from('email_list_items')
            .update({
              status: 'unsubscribed',
              send_status_detail:
                event.type === 'spam_report'
                  ? 'Marked as spam'
                  : 'Unsubscribed at provider',
            })
            .eq('worker_id', sendRow.worker_id)
            .in('status', ['pending', 'queued'])
        }
      } else if (event.type === 'open') {
        if (sendRow) {
          const { error: rpcErr } = await admin.rpc('increment_email_open_count', {
            p_send_id: sendRow.send_id,
            p_occurred_at: occurredAt,
          })
          if (rpcErr) console.error('increment_email_open_count failed:', rpcErr)
          await admin.from('email_engagement_events').insert({
            send_id: sendRow.send_id,
            event_type: 'opened',
            occurred_at: occurredAt,
            payload: null,
          })
        }
      } else if (event.type === 'click') {
        if (sendRow) {
          const { error: rpcErr } = await admin.rpc('increment_email_click_count', {
            p_send_id: sendRow.send_id,
            p_occurred_at: occurredAt,
          })
          if (rpcErr) console.error('increment_email_click_count failed:', rpcErr)
          await admin.from('email_engagement_events').insert({
            send_id: sendRow.send_id,
            event_type: 'clicked',
            occurred_at: occurredAt,
            payload: { url: event.url },
          })
        }
      }

      summary.processed += 1
    }

    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error('Email webhook handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
