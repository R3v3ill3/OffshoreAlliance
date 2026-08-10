/**
 * Single SMS webhook endpoint (brief §2.3 item 1 — Mobile Message has
 * account-level webhooks; we dispatch on event type).
 *
 * Auth (either passes):
 *   - Provider HMAC via provider.verifyWebhook (Mobile Message
 *     X-MM-Timestamp / X-MM-Signature) when a webhook secret is
 *     configured, OR
 *   - Shared-secret query param ?token= matched against
 *     app_settings.sms_webhook_token (seeded by the Phase 1 migration).
 *   The mock provider's verifyWebhook always returns true, so it is
 *   deliberately NOT consulted — mock/unconfigured setups must present
 *   the token.
 *
 * Dispatch (all handlers idempotent — Mobile Message delivers
 * at-least-once, out of order):
 *   - status      → sms_delivery_events (UNIQUE no-op on redelivery) +
 *                   monotonic sms_list_items / sms_send_log transitions
 *                   (terminal states only reachable from 'sent') +
 *                   list counter recount.
 *   - unsubscribe → workers.sms_opt_out for every worker on the number +
 *                   an sms_interactions STOP row so the Phase 0
 *                   trg_sms_optout_keyword trigger / audit trail fires.
 *   - inbound     → Phase 2 conversation routing (brief §7.0): to-number
 *                   → sms_numbers row → open (number, member) pair thread
 *                   → matched worker's open thread on the number → else
 *                   CREATE (triage when unmatched, needs_response when
 *                   matched; campaign scope from the correlated / most
 *                   recent send ≤ 7 days). The decision itself is the
 *                   pure resolveInboundConversation(). Alongside the
 *                   thread append: the Phase 1 sms_interactions insert
 *                   (worker-matched only, now linked via interaction_id)
 *                   and an ATOMIC reply_count bump
 *                   (increment_sms_reply_count RPC — no read-modify-
 *                   write). Unread bump + state flip are atomic too
 *                   (touch_sms_conversation_inbound), gated on the
 *                   sms_messages provider_message_id upsert being new.
 *   - anything else → 200 {ok:true} (never make the provider retry).
 */
import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSmsProvider } from '@/lib/sms/provider'
import type { MessageDeliveryStatus } from '@/lib/sms/provider'
import { toE164 } from '@/lib/phone/normalise-phone'
import { countSegments } from '@/lib/sms/segments'
import {
  findNumberForInbound,
  resolveInboundConversation,
  type RoutingOpenConversation,
} from '@/lib/sms/conversation-routing'

export const dynamic = 'force-dynamic'

const UNIQUE_VIOLATION = '23505'
/** sms_interactions.phone_number is VARCHAR(30) — clamp provider input. */
const PHONE_NUMBER_MAX = 30

/** Constant-time shared-token comparison (length-guarded). */
function tokenMatches(presented: string, expected: string): boolean {
  if (!presented || !expected) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function eventTypeForStatus(
  status: MessageDeliveryStatus,
): 'queued' | 'sent' | 'delivered' | 'failed' | null {
  switch (status) {
    case 'pending':
    case 'scheduled':
      return 'queued'
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'failed':
    case 'cancelled':
      return 'failed'
    default:
      return null
  }
}

/**
 * Insert a delivery-event row; returns true when the row is new (the
 * caller should apply side effects) and false on redelivery. Any error
 * other than a unique violation is THROWN so the handler returns 500 —
 * Mobile Message retries for ~4h and the event is not silently lost.
 */
async function insertDeliveryEvent(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    provider_message_id: string
    event_type: string
    part_number: number
    payload: unknown
    occurred_at: string
  },
): Promise<boolean> {
  const { data, error } = await admin
    .from('sms_delivery_events')
    .upsert(row, {
      onConflict: 'provider_message_id,event_type,part_number',
      ignoreDuplicates: true,
    })
    .select('event_id')
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false
    throw error
  }
  return (data?.length ?? 0) > 0
}

/**
 * Recount a list's delivered/failed counters (idempotent). Uses exact
 * count queries — never row fetches, which PostgREST caps at 1000.
 */
async function recountListCounters(
  admin: ReturnType<typeof createAdminClient>,
  listId: number,
): Promise<void> {
  const countStatus = async (statuses: string[]): Promise<number> => {
    const { count } = await admin
      .from('sms_list_items')
      .select('item_id', { count: 'exact', head: true })
      .eq('list_id', listId)
      .in('status', statuses)
    return count ?? 0
  }
  const [sent, delivered, failed] = await Promise.all([
    countStatus(['sent']),
    countStatus(['delivered']),
    countStatus(['failed']),
  ])
  await admin
    .from('sms_lists')
    .update({
      sent_items: sent + delivered + failed,
      delivered_items: delivered,
      failed_items: failed,
    })
    .eq('list_id', listId)
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    const provider = await getSmsProvider()

    // ── Auth ─────────────────────────────────────────────────
    const admin = createAdminClient()
    const { data: tokenRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'sms_webhook_token')
      .maybeSingle()
    const expectedToken = tokenRow?.value ?? ''
    const presentedToken = req.nextUrl.searchParams.get('token') ?? ''
    const tokenOk = tokenMatches(presentedToken, expectedToken)

    let authorised = tokenOk
    if (!authorised && provider.name === 'mobile_message') {
      const headers: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
      })
      authorised = provider.verifyWebhook(rawBody, headers)
    }
    if (!authorised) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse ────────────────────────────────────────────────
    const event = provider.parseWebhook(rawBody)
    let rawPayload: Record<string, unknown> = {}
    try {
      rawPayload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      // keep {}
    }

    // ── Dispatch ─────────────────────────────────────────────
    if (event.type === 'status') {
      if (!event.providerMessageId) return NextResponse.json({ ok: true })
      const eventType = eventTypeForStatus(event.status)
      if (!eventType) return NextResponse.json({ ok: true })

      const partRaw = rawPayload.part_number ?? rawPayload.part
      const partNumber =
        typeof partRaw === 'number' && Number.isFinite(partRaw) ? partRaw : 0
      const occurredAt = event.occurredAt ?? new Date().toISOString()

      const isNew = await insertDeliveryEvent(admin, {
        provider_message_id: event.providerMessageId,
        event_type: eventType,
        part_number: partNumber,
        payload: rawPayload,
        occurred_at: occurredAt,
      })
      if (!isNew) return NextResponse.json({ ok: true, deduplicated: true })

      if (eventType === 'delivered' || eventType === 'failed') {
        const failureReason =
          eventType === 'failed'
            ? event.status === 'cancelled'
              ? 'Cancelled at provider'
              : typeof rawPayload.reason === 'string'
                ? rawPayload.reason
                : 'Delivery failed'
            : null

        // Monotonic: terminal item/log states only reachable from 'sent';
        // out-of-order or conflicting terminal events are no-ops.
        const { data: transitioned } = await admin
          .from('sms_list_items')
          .update(
            eventType === 'delivered'
              ? { status: 'delivered', delivered_at: occurredAt }
              : { status: 'failed', failure_reason: failureReason },
          )
          .eq('provider_message_id', event.providerMessageId)
          .eq('status', 'sent')
          .select('list_id')

        await admin
          .from('sms_send_log')
          .update(
            eventType === 'delivered'
              ? { status: 'delivered', delivered_at: occurredAt }
              : {
                  status: 'failed',
                  failed_at: occurredAt,
                  failure_reason: failureReason,
                },
          )
          .eq('provider_message_id', event.providerMessageId)
          .eq('status', 'sent')

        // Mirror onto the conversation message row (Phase 2) so threads
        // show delivery state. Same monotonic guard: only from 'sent'.
        await admin
          .from('sms_messages')
          .update(
            eventType === 'delivered'
              ? { status: 'delivered' }
              : { status: 'failed', error: failureReason },
          )
          .eq('provider_message_id', event.providerMessageId)
          .eq('status', 'sent')

        const listIds = [
          ...new Set((transitioned ?? []).map((r) => r.list_id as number)),
        ]
        for (const listId of listIds) {
          await recountListCounters(admin, listId)
        }
      }

      return NextResponse.json({ ok: true })
    }

    if (event.type === 'unsubscribe') {
      const phone = toE164(event.from)
      if (!phone) return NextResponse.json({ ok: true, unmatched: true })

      const { data: workers } = await admin
        .from('workers')
        .select('worker_id, sms_opt_out')
        .eq('phone_e164', phone)
      const workerIds = (workers ?? []).map((w) => w.worker_id)
      if (workerIds.length === 0) {
        return NextResponse.json({ ok: true, unmatched: true })
      }

      // Belt: set the flag directly (don't clobber an earlier opt-out
      // timestamp) …
      await admin
        .from('workers')
        .update({
          sms_opt_out: true,
          sms_opt_out_at: new Date().toISOString(),
          sms_opt_out_source: 'inbound_stop',
        })
        .in('worker_id', workerIds)
        .eq('sms_opt_out', false)

      // … and brace: record the STOP as an inbound interaction so the
      // Phase 0 trigger + worker_activity_log audit trail fire. Deduped
      // on external_message_id (webhook retries).
      let interactionIsNew = true
      if (event.providerMessageId) {
        const { data: existing } = await admin
          .from('sms_interactions')
          .select('id')
          .eq('external_message_id', event.providerMessageId)
          .maybeSingle()
        interactionIsNew = !existing
      }
      if (interactionIsNew) {
        const { error: insErr } = await admin.from('sms_interactions').insert({
          worker_id: workerIds[0],
          direction: 'inbound',
          phone_number: event.from.slice(0, PHONE_NUMBER_MAX),
          phone_e164: phone,
          body: 'STOP',
          external_message_id: event.providerMessageId,
          received_at: event.receivedAt ?? new Date().toISOString(),
          notes: 'Provider unsubscribe webhook',
        })
        if (insErr && insErr.code !== UNIQUE_VIOLATION) {
          console.error('sms_interactions STOP insert failed:', insErr)
        }
      }

      if (event.providerMessageId) {
        await insertDeliveryEvent(admin, {
          provider_message_id: event.providerMessageId,
          event_type: 'opted_out',
          part_number: 0,
          payload: rawPayload,
          occurred_at: event.receivedAt ?? new Date().toISOString(),
        })
      }

      return NextResponse.json({ ok: true, opted_out: workerIds.length })
    }

    if (event.type === 'inbound') {
      const receivedAt = event.receivedAt ?? new Date().toISOString()
      const phone = toE164(event.from)

      // Worker match on the normalised member number.
      const { data: workers } = phone
        ? await admin
            .from('workers')
            .select('worker_id')
            .eq('phone_e164', phone)
        : { data: null }
      const matchedWorkerIds = (workers ?? []).map(
        (w) => w.worker_id as number,
      )
      const workerId = matchedWorkerIds[0] ?? null

      // Reply correlation: our custom_ref is the sms_send_log send_id;
      // fall back to the provider's original_message_id.
      let sendRow: {
        send_id: number
        campaign_id: number
        created_at: string
      } | null = null
      const refId = Number(event.originalCustomRef)
      if (event.originalCustomRef && Number.isFinite(refId)) {
        const { data } = await admin
          .from('sms_send_log')
          .select('send_id, campaign_id, created_at')
          .eq('send_id', refId)
          .maybeSingle()
        sendRow = data
      }
      if (!sendRow && event.originalMessageId) {
        const { data } = await admin
          .from('sms_send_log')
          .select('send_id, campaign_id, created_at')
          .eq('provider_message_id', event.originalMessageId)
          .maybeSingle()
        sendRow = data
      }

      // Campaign-scope hint for a NEW thread: the correlated send, else
      // the worker's most recent send (the pure resolver applies the
      // 7-day window — brief §7.0 / RECENT_SEND_WINDOW_DAYS).
      let recentSend: { campaign_id: number | null; created_at: string } | null =
        sendRow
      if (!recentSend && workerId != null) {
        const { data: latest } = await admin
          .from('sms_send_log')
          .select('campaign_id, created_at')
          .eq('worker_id', workerId)
          .order('created_at', { ascending: false })
          .limit(1)
        recentSend = latest?.[0] ?? null
      }

      // Number registry match (tolerant of +614… / 614… / 04… forms).
      const { data: numbers } = await admin
        .from('sms_numbers')
        .select('number_id, phone_e164, organiser_id')
        .eq('status', 'active')
      const numberRow = findNumberForInbound(numbers ?? [], event.to)

      // Candidate open threads: the (number, member phone) pair first;
      // the matched worker's threads on this number only as a fallback.
      let openConversations: RoutingOpenConversation[] = []
      if (numberRow && phone) {
        const { data: pairConvs } = await admin
          .from('sms_conversations')
          .select('conversation_id, campaign_id, worker_id, last_message_at')
          .eq('our_number_id', numberRow.number_id)
          .eq('phone_e164', phone)
          .neq('state', 'closed')
        openConversations = (pairConvs ?? []).map((c) => ({
          conversation_id: c.conversation_id as number,
          campaign_id: c.campaign_id as number | null,
          worker_id: c.worker_id as number | null,
          last_message_at: c.last_message_at as string | null,
          matched_on: 'phone' as const,
        }))
        if (openConversations.length === 0 && matchedWorkerIds.length > 0) {
          const { data: workerConvs } = await admin
            .from('sms_conversations')
            .select('conversation_id, campaign_id, worker_id, last_message_at')
            .eq('our_number_id', numberRow.number_id)
            .in('worker_id', matchedWorkerIds)
            .neq('state', 'closed')
          openConversations = (workerConvs ?? []).map((c) => ({
            conversation_id: c.conversation_id as number,
            campaign_id: c.campaign_id as number | null,
            worker_id: c.worker_id as number | null,
            last_message_at: c.last_message_at as string | null,
            matched_on: 'worker' as const,
          }))
        }
      }

      const decision = resolveInboundConversation({
        phoneE164: phone,
        matchedWorkerIds,
        number: numberRow,
        openConversations,
        recentSend,
      })

      // Interaction row (worker-matched only — the Phase 1 behaviour,
      // now with the id captured so the message row can link it).
      let interactionId: number | null = null
      let interactionIsNew = false
      if (workerId != null) {
        if (event.providerMessageId) {
          const { data: existing } = await admin
            .from('sms_interactions')
            .select('id')
            .eq('external_message_id', event.providerMessageId)
            .maybeSingle()
          if (existing) interactionId = existing.id as number
        }
        if (interactionId == null) {
          const { data: inserted, error: insErr } = await admin
            .from('sms_interactions')
            .insert({
              worker_id: workerId,
              campaign_id: sendRow?.campaign_id ?? null,
              direction: 'inbound',
              phone_number: event.from.slice(0, PHONE_NUMBER_MAX),
              phone_e164: phone,
              body: event.body,
              external_message_id: event.providerMessageId,
              received_at: receivedAt,
            })
            .select('id')
            .single()
          if (insErr) {
            if (insErr.code === UNIQUE_VIOLATION && event.providerMessageId) {
              // Raced retry: reuse the winner's row.
              const { data: raced } = await admin
                .from('sms_interactions')
                .select('id')
                .eq('external_message_id', event.providerMessageId)
                .maybeSingle()
              interactionId = (raced?.id as number | undefined) ?? null
            } else {
              throw insErr
            }
          } else {
            interactionId = inserted.id as number
            interactionIsNew = true
          }
        }
      }

      // Conversation attach / create (brief §7.0 precedence via the
      // pure resolver above).
      let conversationId: number | null = null
      if (decision.action === 'attach') {
        conversationId = decision.conversationId
      } else if (decision.action === 'create') {
        const { data: created, error: convErr } = await admin
          .from('sms_conversations')
          .insert(decision.conversation)
          .select('conversation_id')
          .single()
        if (convErr) {
          if (convErr.code === UNIQUE_VIOLATION) {
            // Creation race, or a closed thread occupying the key: attach
            // to it — the touch RPC below reopens closed → needs_response.
            let q = admin
              .from('sms_conversations')
              .select('conversation_id')
              .eq('our_number_id', decision.conversation.our_number_id)
              .eq('phone_e164', decision.conversation.phone_e164)
            q =
              decision.conversation.campaign_id == null
                ? q.is('campaign_id', null)
                : q.eq('campaign_id', decision.conversation.campaign_id)
            const { data: existingConv } = await q.maybeSingle()
            conversationId =
              (existingConv?.conversation_id as number | undefined) ?? null
          } else {
            // Thread creation failed: 500 so the provider retries (the
            // interaction insert above is idempotent on retry).
            throw convErr
          }
        } else {
          conversationId = created.conversation_id as number
        }
      }

      // Message append — idempotent on provider_message_id; the unread
      // bump / state flip / reply count only fire when the row is new.
      let messageIsNew = false
      if (conversationId != null) {
        const messageRow = {
          conversation_id: conversationId,
          direction: 'inbound',
          body: event.body,
          phone_e164: phone,
          provider_message_id: event.providerMessageId,
          interaction_id: interactionId,
          status: 'received',
          segments: event.body ? countSegments(event.body).segments : null,
          created_at: receivedAt,
        }
        if (event.providerMessageId) {
          const { data: msgIns, error: msgErr } = await admin
            .from('sms_messages')
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
            .from('sms_messages')
            .insert(messageRow)
          if (msgErr) throw msgErr
          messageIsNew = true
        }

        if (messageIsNew) {
          const { error: touchErr } = await admin.rpc(
            'touch_sms_conversation_inbound',
            {
              p_conversation_id: conversationId,
              p_occurred_at: receivedAt,
            },
          )
          if (touchErr) {
            console.error('touch_sms_conversation_inbound failed:', touchErr)
          }
        }
      }

      // Atomic reply-count bump (replaces the Phase 1 read-modify-write).
      // Gate: the message row when a thread exists (single idempotency
      // handle), else the interaction row (the Phase 1 gate, unchanged
      // for the no-thread fallback path).
      const sideEffectsAreNew =
        conversationId != null ? messageIsNew : interactionIsNew
      if (sendRow && sideEffectsAreNew) {
        const { error: bumpErr } = await admin.rpc(
          'increment_sms_reply_count',
          {
            p_send_id: sendRow.send_id,
            p_received_at: receivedAt,
          },
        )
        if (bumpErr) {
          console.error('increment_sms_reply_count failed:', bumpErr)
        }
      }

      if (event.providerMessageId) {
        await insertDeliveryEvent(admin, {
          provider_message_id: event.providerMessageId,
          event_type: 'replied',
          part_number: 0,
          payload: rawPayload,
          occurred_at: receivedAt,
        })
      }

      if (conversationId == null && workerId == null) {
        // No thread possible (unknown to-number / unparseable from) and
        // no worker — nothing recorded, matching Phase 1.
        return NextResponse.json({ ok: true, unmatched: true })
      }
      return NextResponse.json({
        ok: true,
        conversation_id: conversationId,
        deduplicated: !sideEffectsAreNew || undefined,
      })
    }

    // Unknown/unhandled event types: acknowledge so the provider stops
    // retrying.
    return NextResponse.json({ ok: true, skipped: event.type })
  } catch (error) {
    console.error('SMS webhook handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
