/**
 * Cron worker that drains queued SMS list items (brief §7.2 outbound
 * dispatcher). Registered in vercel.json at *​/5 * * * *.
 *
 * Double-send protection: items are atomically claimed
 * (queued → 'sending' + claimed_at, guarded by the status predicate on
 * the UPDATE) before any provider call, so an overlapping cron tick can
 * never pick up the same rows; the provider client also carries a hard
 * fetch timeout. Claims stranded by a crash are recovered back to
 * 'queued' after 15 minutes (small accepted re-send risk — the claim is
 * the primary guard).
 *
 * Per eligible list (status queued/sending, schedule due, blackout
 * window open in the list's timezone unless a recorded override):
 *   1. Re-validate the draft body compliance (org name + opt-out) — a
 *      paused-then-edited draft must never send non-compliant copy; on
 *      failure the list is paused.
 *   2. Claim a batch, then re-check workers.sms_opt_out at send time
 *      (audience-time screening is not enough — a STOP may arrive
 *      between queue and send) and phone_e164 presence.
 *   3. Resolve merge fields per worker (campaign context via the shared
 *      loader + worker first/last name, occupation).
 *   4. Upsert sms_send_log rows (custom_ref = send_id), then
 *      provider.sendBatch with the list's sender number and a per-batch
 *      Idempotency-Key.
 *   5. Write per-item results: success → sent (+provider_message_id),
 *      blocked (provider-side unsubscribe) → blocked + worker opt-out
 *      mirror, error → failed.
 *   6. Recount list counters (count queries — never row fetches, which
 *      cap at 1000); complete the list when drained.
 *
 * Authentication: Vercel cron `Authorization: Bearer <CRON_SECRET>`
 * (clone of materialise-sequence-runs).
 */
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSmsProvider } from '@/lib/sms/provider'
import type { OutboundSms, SendResult } from '@/lib/sms/provider'
import { isWithinSendWindow, computeSendBefore, DEFAULT_SMS_TIMEZONE } from '@/lib/sms/blackout'
import { countSegments } from '@/lib/sms/segments'
import { validateSmsBody } from '@/lib/sms/compliance'
import {
  resolveScriptVariables,
  TEMPLATE_TOKEN_RE,
} from '@/lib/comms/template-variables'
import { loadCampaignEmailContext } from '@/lib/comms/campaign-email-context'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

/** Total items processed per run (keeps the function inside cron limits). */
const RUN_BATCH_CAP = 500
/** Parallelism for per-item result writes. */
const WRITE_CHUNK = 25
/** 'sending' claims older than this are assumed crashed and re-queued. */
const STALE_CLAIM_MINUTES = 15

interface ListRow {
  list_id: number
  campaign_id: number
  draft_id: number | null
  status: string
  sender_number_id: number | null
  timezone: string | null
  blackout_override: boolean
  scheduled_for: string | null
}

interface ItemRow {
  item_id: number
  worker_id: number
  phone_e164: string | null
  sort_order: number
}

interface WorkerRow {
  worker_id: number
  first_name: string
  last_name: string
  occupation: string | null
  phone_e164: string | null
  sms_opt_out: boolean
}

function resolveBody(
  template: string,
  context: Record<string, string | undefined>,
): string {
  // Resolve known tokens, then strip any leftovers so literal {{x}}
  // never reaches a member's phone; collapse doubled spaces.
  return resolveScriptVariables(template, context)
    .replace(TEMPLATE_TOKEN_RE, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

async function inChunks<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += WRITE_CHUNK) {
    await Promise.all(items.slice(i, i + WRITE_CHUNK).map(fn))
  }
}

/** Exact per-status count without fetching rows (PostgREST caps at 1000). */
async function countItems(
  supabase: SupabaseClient,
  listId: number,
  statuses: string[],
): Promise<number> {
  const { count } = await supabase
    .from('sms_list_items')
    .select('item_id', { count: 'exact', head: true })
    .eq('list_id', listId)
    .in('status', statuses)
  return count ?? 0
}

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization') ?? ''
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: 'missing supabase env' }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const now = new Date()
  const summary = {
    lists_seen: 0,
    lists_blocked_by_window: [] as number[],
    lists_paused_non_compliant: [] as number[],
    lists_completed: [] as number[],
    stale_claims_recovered: 0,
    sent: 0,
    blocked: 0,
    failed: 0,
    opted_out: 0,
    skipped: 0,
    errors: [] as Array<{ list_id: number; error: string }>,
  }

  // Stale-claim recovery: 'sending' rows whose run crashed mid-flight.
  const staleCutoff = new Date(
    now.getTime() - STALE_CLAIM_MINUTES * 60 * 1000,
  ).toISOString()
  const { data: recovered, error: recoverErr } = await supabase
    .from('sms_list_items')
    .update({ status: 'queued', claimed_at: null })
    .eq('status', 'sending')
    .lt('claimed_at', staleCutoff)
    .select('item_id')
  if (recoverErr) {
    console.error('dispatch-sms-queue: stale-claim recovery failed:', recoverErr)
  } else if (recovered && recovered.length > 0) {
    summary.stale_claims_recovered = recovered.length
    console.warn(
      `dispatch-sms-queue: recovered ${recovered.length} stale 'sending' claims ` +
        `(items ${recovered.map((r) => r.item_id).join(', ')}) — possible ` +
        'earlier crash; small re-send risk accepted',
    )
  }

  const { data: listsRaw, error: listErr } = await supabase
    .from('sms_lists')
    .select(
      'list_id, campaign_id, draft_id, status, sender_number_id, timezone, blackout_override, scheduled_for',
    )
    .in('status', ['queued', 'sending'])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
    .order('created_at', { ascending: true })
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const lists = (listsRaw ?? []) as ListRow[]
  summary.lists_seen = lists.length
  let capacity = RUN_BATCH_CAP

  let provider: Awaited<ReturnType<typeof getSmsProvider>> | null = null

  for (const list of lists) {
    if (capacity <= 0) break
    const tz = list.timezone || DEFAULT_SMS_TIMEZONE

    try {
      // Blackout window enforcement at the worker, not just the UI
      // (brief §3.1 item 10). Overrides are recorded on the list.
      if (!list.blackout_override && !isWithinSendWindow(now, tz)) {
        summary.lists_blocked_by_window.push(list.list_id)
        // Deferred to the next window: refresh stale send_before stamps.
        const nextBefore = computeSendBefore(now, tz, false)
        await supabase
          .from('sms_list_items')
          .update({ send_before: nextBefore.toISOString() })
          .eq('list_id', list.list_id)
          .eq('status', 'queued')
          .lt('send_before', now.toISOString())
        continue
      }

      const { data: candidates } = await supabase
        .from('sms_list_items')
        .select('item_id')
        .eq('list_id', list.list_id)
        .eq('status', 'queued')
        .order('sort_order', { ascending: true })
        .limit(capacity)

      if (!candidates || candidates.length === 0) {
        // Nothing left to send: complete the list when fully drained.
        // ('sending' rows belong to a concurrent/crashed run — not drained.)
        const remaining = await countItems(supabase, list.list_id, [
          'queued',
          'pending',
          'sending',
        ])
        if (remaining === 0 && list.status === 'sending') {
          await supabase
            .from('sms_lists')
            .update({ status: 'sent' })
            .eq('list_id', list.list_id)
          summary.lists_completed.push(list.list_id)
        }
        continue
      }

      // Validate draft + sender BEFORE claiming, so failures never
      // strand items in 'sending'.
      if (!list.draft_id) throw new Error('List has no linked draft')
      const { data: draft } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, body')
        .eq('draft_id', list.draft_id)
        .maybeSingle()
      const template = (draft?.body as string | undefined)?.trim()
      if (!template) throw new Error('Draft body is empty')

      // Compliance re-check at dispatch time — never send copy that has
      // lost its org identification or opt-out line.
      const compliance = validateSmsBody(template)
      if (!compliance.ok) {
        await supabase
          .from('sms_lists')
          .update({ status: 'paused' })
          .eq('list_id', list.list_id)
        summary.lists_paused_non_compliant.push(list.list_id)
        summary.errors.push({
          list_id: list.list_id,
          error: `Paused — non-compliant body: ${compliance.errors.join(' ')}`,
        })
        continue
      }

      if (!list.sender_number_id) throw new Error('List has no sender number')
      const { data: sender } = await supabase
        .from('sms_numbers')
        .select('number_id, phone_e164, status')
        .eq('number_id', list.sender_number_id)
        .maybeSingle()
      if (!sender || sender.status !== 'active') {
        throw new Error('Sender number missing or retired')
      }
      // Mobile Message takes the dedicated number as digits (E.164
      // without the '+').
      const senderDigits = (sender.phone_e164 as string).replace(/^\+/, '')

      if (list.status === 'queued') {
        await supabase
          .from('sms_lists')
          .update({ status: 'sending' })
          .eq('list_id', list.list_id)
      }

      // Atomic claim: only rows still 'queued' transition to 'sending',
      // and ONLY the returned rows are sent — the double-send guard
      // against overlapping cron ticks.
      const { data: claimedRaw, error: claimErr } = await supabase
        .from('sms_list_items')
        .update({ status: 'sending', claimed_at: new Date().toISOString() })
        .in(
          'item_id',
          candidates.map((c) => c.item_id),
        )
        .eq('status', 'queued')
        .select('item_id, worker_id, phone_e164, sort_order')
      if (claimErr) throw claimErr
      const claimed = ((claimedRaw ?? []) as ItemRow[]).sort(
        (a, b) => a.sort_order - b.sort_order,
      )
      capacity -= claimed.length
      if (claimed.length === 0) continue

      // Send-time re-checks against workers (opt-out may postdate the
      // audience build — union-wide suppression, brief §3.1 item 12).
      const workerIds = claimed.map((i) => i.worker_id)
      const workerById = new Map<number, WorkerRow>()
      for (let i = 0; i < workerIds.length; i += 500) {
        const { data: workers } = await supabase
          .from('workers')
          .select('worker_id, first_name, last_name, occupation, phone_e164, sms_opt_out')
          .in('worker_id', workerIds.slice(i, i + 500))
        for (const w of (workers ?? []) as WorkerRow[]) {
          workerById.set(w.worker_id, w)
        }
      }

      const sendable: Array<{ item: ItemRow; worker: WorkerRow; to: string }> = []
      const screenedOut: Array<{ item: ItemRow; status: string; reason: string }> = []
      for (const item of claimed) {
        const worker = workerById.get(item.worker_id)
        const to = item.phone_e164 ?? worker?.phone_e164 ?? null
        if (!worker) {
          screenedOut.push({ item, status: 'skipped', reason: 'Worker not found' })
        } else if (worker.sms_opt_out) {
          screenedOut.push({
            item,
            status: 'opted_out',
            reason: 'Worker has opted out of SMS',
          })
        } else if (!to) {
          screenedOut.push({
            item,
            status: 'skipped',
            reason: 'No mobile number on file',
          })
        } else {
          sendable.push({ item, worker, to })
        }
      }

      await inChunks(screenedOut, async ({ item, status, reason }) => {
        await supabase
          .from('sms_list_items')
          .update({ status, failure_reason: reason })
          .eq('item_id', item.item_id)
          .eq('status', 'sending')
      })
      summary.opted_out += screenedOut.filter((s) => s.status === 'opted_out').length
      summary.skipped += screenedOut.filter((s) => s.status === 'skipped').length

      if (sendable.length > 0) {
        const baseContext = await loadCampaignEmailContext(
          supabase,
          list.campaign_id,
        )

        // Pre-create send_log rows so custom_ref carries the send_id
        // (reply correlation in the webhook leg).
        const logRows = sendable.map(({ worker, to }) => {
          const resolved = resolveBody(template, {
            ...baseContext,
            first_name: worker.first_name,
            last_name: worker.last_name,
            occupation: worker.occupation ?? undefined,
          })
          return {
            draft_id: list.draft_id as number,
            campaign_id: list.campaign_id,
            worker_id: worker.worker_id,
            list_id: list.list_id,
            phone_e164: to,
            segments: countSegments(resolved).segments,
            status: 'queued',
            _resolved: resolved,
          }
        })
        const { data: sendLogRows, error: logErr } = await supabase
          .from('sms_send_log')
          .upsert(
            logRows.map((r) => {
              const row = { ...r } as Partial<typeof r>
              delete row._resolved
              return row
            }),
            { onConflict: 'draft_id,worker_id' },
          )
          .select('send_id, worker_id')
        if (logErr) throw logErr
        const sendIdByWorker = new Map<number, number>(
          (sendLogRows ?? []).map((r) => [r.worker_id as number, r.send_id as number]),
        )

        const batch: OutboundSms[] = sendable.map(({ worker, to }, i) => ({
          to,
          body: logRows[i]._resolved,
          sender: senderDigits,
          customRef: String(sendIdByWorker.get(worker.worker_id) ?? ''),
        }))

        if (!provider) provider = await getSmsProvider()
        const firstId = sendable[0].item.item_id
        const lastId = sendable[sendable.length - 1].item.item_id
        const idempotencyKey = `sms-list-${list.list_id}-${firstId}-${lastId}`
        let results: SendResult[]
        try {
          results = await provider.sendBatch(batch, { idempotencyKey })
        } catch (sendErr) {
          // Whole-batch failure: mark items failed so the blast surfaces
          // the error instead of silently retrying forever. The logged
          // idempotency key is the reconciliation handle against the
          // provider's message log.
          const reason =
            sendErr instanceof Error ? sendErr.message : 'Provider send failed'
          console.error(
            `dispatch-sms-queue: whole-batch send failed for list ${list.list_id} ` +
              `(Idempotency-Key: ${idempotencyKey}, ${sendable.length} messages): ${reason}`,
          )
          await inChunks(sendable, async ({ item }) => {
            await supabase
              .from('sms_list_items')
              .update({ status: 'failed', failure_reason: reason })
              .eq('item_id', item.item_id)
              .eq('status', 'sending')
          })
          summary.failed += sendable.length
          throw sendErr
        }

        await inChunks(
          sendable.map((s, i) => ({ ...s, result: results[i] })),
          async ({ item, worker, result }) => {
            const sendId = sendIdByWorker.get(worker.worker_id)
            const sentAt = new Date().toISOString()
            if (result?.status === 'success') {
              await supabase
                .from('sms_list_items')
                .update({
                  status: 'sent',
                  provider_message_id: result.providerMessageId,
                  sent_at: sentAt,
                  failure_reason: null,
                })
                .eq('item_id', item.item_id)
              if (sendId) {
                await supabase
                  .from('sms_send_log')
                  .update({
                    status: 'sent',
                    provider_message_id: result.providerMessageId,
                    sent_at: sentAt,
                    cost: result.cost ?? null,
                  })
                  .eq('send_id', sendId)
              }
              summary.sent += 1
            } else if (result?.status === 'blocked') {
              // Provider-side unsubscribe — mirror to the worker flag so
              // audience screening catches it next time.
              await supabase
                .from('sms_list_items')
                .update({
                  status: 'blocked',
                  failure_reason: 'Recipient unsubscribed at provider',
                })
                .eq('item_id', item.item_id)
              if (sendId) {
                await supabase
                  .from('sms_send_log')
                  .update({
                    status: 'blocked',
                    failure_reason: 'Recipient unsubscribed at provider',
                  })
                  .eq('send_id', sendId)
              }
              await supabase
                .from('workers')
                .update({
                  sms_opt_out: true,
                  sms_opt_out_at: sentAt,
                  sms_opt_out_source: 'inbound_stop',
                })
                .eq('worker_id', worker.worker_id)
                .eq('sms_opt_out', false)
              summary.blocked += 1
            } else {
              const reason = result?.error ?? 'Provider send failed'
              await supabase
                .from('sms_list_items')
                .update({ status: 'failed', failure_reason: reason })
                .eq('item_id', item.item_id)
              if (sendId) {
                await supabase
                  .from('sms_send_log')
                  .update({
                    status: 'failed',
                    failed_at: sentAt,
                    failure_reason: reason,
                  })
                  .eq('send_id', sendId)
              }
              summary.failed += 1
            }
          },
        )
      }

      // Recount counters (count queries only) + complete when drained.
      const [sentN, deliveredN, failedN, remaining] = await Promise.all([
        countItems(supabase, list.list_id, ['sent']),
        countItems(supabase, list.list_id, ['delivered']),
        countItems(supabase, list.list_id, ['failed']),
        countItems(supabase, list.list_id, ['queued', 'pending', 'sending']),
      ])
      await supabase
        .from('sms_lists')
        .update({
          sent_items: sentN + deliveredN + failedN,
          delivered_items: deliveredN,
          failed_items: failedN,
          ...(remaining === 0 ? { status: 'sent' } : {}),
        })
        .eq('list_id', list.list_id)
      if (remaining === 0) summary.lists_completed.push(list.list_id)
    } catch (err) {
      summary.errors.push({
        list_id: list.list_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json(summary)
}
