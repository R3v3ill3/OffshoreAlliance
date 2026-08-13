/**
 * POST /api/campaigns/[id]/sms-lists/[listId]/p2p-send — fire the
 * personalised initial to a hand-picked selection of a P2P chat board
 * (mode='p2p' sms_list). Progressive P2P, not a blast: selections are
 * capped at P2P_SEND_CAP per call and there is NO blackout hard-block
 * (organiser-judgement sends — the board shows a soft warning banner
 * outside 09:00–20:00); opted-out members are still hard-skipped.
 *
 * Per item:
 *   1. atomic claim (pending → sending) so a double-click can never
 *      double-send,
 *   2. send-time re-check of workers.sms_opt_out / phone,
 *   3. render the initial (merge fields resolved, leftovers stripped),
 *   4. compliance check on the template (org identification — initial
 *      outreach is bulk-adjacent, unlike inbox replies),
 *   5. one provider.sendBatch for the selection,
 *   6. create-or-attach the conversation on the exact thread key
 *      (list sender number, worker phone, campaign) — new threads
 *      'messaged'; pre-existing threads get guarded timestamp updates
 *      and needs_message/closed → messaged (never regressing an active
 *      'convo'/'needs_response' state),
 *   7. sms_messages row (sender_user_id = the clicking user),
 *      sms_send_log upsert (admin client — send_log writes are
 *      service-role only, matching the dispatch cron), item status +
 *      conversation_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { getSmsProvider } from '@/lib/sms/provider'
import type { OutboundSms, SendResult } from '@/lib/sms/provider'
import { countSegments } from '@/lib/sms/segments'
import { validateSmsBody } from '@/lib/sms/compliance'
import { loadCampaignEmailContext } from '@/lib/comms/campaign-email-context'
import {
  P2P_SENDABLE_STATUSES,
  P2P_SEND_CAP,
  renderP2pBody,
} from '@/lib/sms/p2p'
import { inboxUnsafePurposeError } from '@/lib/sms/sender-purpose'

interface SendBody {
  item_ids?: number[]
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

interface ResultItem {
  item_id: number
  status: 'sent' | 'failed' | 'blocked' | 'opted_out' | 'skipped'
  conversation_id: number | null
  error: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    const { data: canWrite, error: permErr } = await supabase.rpc(
      'can_write_to_campaign',
      { p_campaign_id: cid },
    )
    if (permErr) throw permErr
    if (!canWrite) {
      return NextResponse.json(
        { error: 'No write access to this campaign' },
        { status: 403 },
      )
    }

    const body = (await req.json()) as SendBody
    const itemIds = [
      ...new Set(
        (Array.isArray(body.item_ids) ? body.item_ids : []).filter(
          (n): n is number => Number.isFinite(n),
        ),
      ),
    ]
    if (itemIds.length === 0) {
      return NextResponse.json({ error: 'No items selected' }, { status: 400 })
    }
    if (itemIds.length > P2P_SEND_CAP) {
      return NextResponse.json(
        {
          error: `Send at most ${P2P_SEND_CAP} initials per call — this is progressive P2P, not a blast.`,
        },
        { status: 400 },
      )
    }

    const { data: list, error: listErr } = await supabase
      .from('sms_lists')
      .select('list_id, campaign_id, name, status, mode, draft_id, sender_number_id')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }
    if ((list.mode ?? 'blast') !== 'p2p') {
      return NextResponse.json({ error: 'Not a P2P chat board' }, { status: 400 })
    }
    if (list.status !== 'draft') {
      return NextResponse.json(
        { error: 'This chat board is closed' },
        { status: 409 },
      )
    }
    if (!list.draft_id) {
      return NextResponse.json({ error: 'Board has no message draft' }, { status: 400 })
    }
    if (!list.sender_number_id) {
      return NextResponse.json(
        { error: 'Board has no sender number' },
        { status: 400 },
      )
    }

    const { data: draft, error: draftErr } = await supabase
      .from('campaign_comms_drafts')
      .select('draft_id, body')
      .eq('draft_id', list.draft_id)
      .maybeSingle()
    if (draftErr) throw draftErr
    const template = (draft?.body as string | undefined)?.trim()
    if (!template) {
      return NextResponse.json({ error: 'Message body is empty' }, { status: 400 })
    }
    // Compliance: the initial is bulk-adjacent outreach — org
    // identification is required, same as blast dispatch.
    const compliance = validateSmsBody(template)
    if (!compliance.ok) {
      return NextResponse.json(
        { error: compliance.errors.join(' ') },
        { status: 400 },
      )
    }

    const { data: sender, error: senderErr } = await supabase
      .from('sms_numbers')
      .select('number_id, phone_e164, status, purpose')
      .eq('number_id', list.sender_number_id)
      .maybeSingle()
    if (senderErr) throw senderErr
    if (!sender || sender.status !== 'active') {
      return NextResponse.json(
        { error: 'Sender number missing or retired' },
        { status: 409 },
      )
    }
    const unsafe = inboxUnsafePurposeError(sender.purpose as string | null)
    if (unsafe) {
      return NextResponse.json({ error: unsafe }, { status: 409 })
    }
    const senderDigits = (sender.phone_e164 as string).replace(/^\+/, '')

    // Atomic claim: only rows still sendable ('pending', or 'failed'
    // for a retry after a transient provider outage) flip to
    // 'sending', and only the returned rows are sent — the
    // double-click guard.
    const { data: claimedRaw, error: claimErr } = await supabase
      .from('sms_list_items')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .eq('list_id', lid)
      .in('item_id', itemIds)
      .in('status', [...P2P_SENDABLE_STATUSES])
      .select('item_id, worker_id, phone_e164, sort_order')
    if (claimErr) throw claimErr
    const claimed = ((claimedRaw ?? []) as ItemRow[]).sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    if (claimed.length === 0) {
      return NextResponse.json(
        { error: 'None of the selected rows are still sendable' },
        { status: 409 },
      )
    }

    // Send-time re-check against workers (a STOP may postdate the
    // board build — union-wide suppression is hard, no override).
    const workerIds = claimed.map((i) => i.worker_id)
    const workerById = new Map<number, WorkerRow>()
    for (let i = 0; i < workerIds.length; i += 500) {
      const { data: workers, error: wErr } = await supabase
        .from('workers')
        .select('worker_id, first_name, last_name, occupation, phone_e164, sms_opt_out')
        .in('worker_id', workerIds.slice(i, i + 500))
      if (wErr) throw wErr
      for (const w of (workers ?? []) as WorkerRow[]) workerById.set(w.worker_id, w)
    }

    const results: ResultItem[] = []
    const sendable: Array<{ item: ItemRow; worker: WorkerRow; to: string }> = []
    for (const item of claimed) {
      const worker = workerById.get(item.worker_id)
      const to = item.phone_e164 ?? worker?.phone_e164 ?? null
      if (!worker) {
        results.push({ item_id: item.item_id, status: 'skipped', conversation_id: null, error: 'Worker not found' })
      } else if (worker.sms_opt_out) {
        results.push({ item_id: item.item_id, status: 'opted_out', conversation_id: null, error: 'Worker has opted out of SMS' })
      } else if (!to) {
        results.push({ item_id: item.item_id, status: 'skipped', conversation_id: null, error: 'No mobile number on file' })
      } else {
        sendable.push({ item, worker, to })
      }
    }
    // Write screened-out statuses back (from 'sending').
    for (const r of results) {
      await supabase
        .from('sms_list_items')
        .update({ status: r.status, failure_reason: r.error })
        .eq('item_id', r.item_id)
        .eq('status', 'sending')
    }

    const admin = createAdminClient()
    const sentAt = new Date().toISOString()

    if (sendable.length > 0) {
      const baseContext = await loadCampaignEmailContext(supabase, cid)
      const resolved = sendable.map(({ worker }) =>
        renderP2pBody(template, {
          ...baseContext,
          first_name: worker.first_name,
          last_name: worker.last_name,
          occupation: worker.occupation ?? undefined,
        }),
      )

      // Pre-create send_log rows so custom_ref carries the send_id (the
      // webhook's reply-correlation handle). Admin client: send_log
      // writes are service-role only, matching the dispatch cron.
      const logRows = sendable.map(({ worker, to }, i) => ({
        draft_id: list.draft_id as number,
        campaign_id: cid,
        worker_id: worker.worker_id,
        list_id: lid,
        phone_e164: to,
        segments: countSegments(resolved[i]).segments,
        status: 'queued',
      }))
      const { data: sendLogRows, error: logErr } = await admin
        .from('sms_send_log')
        .upsert(logRows, { onConflict: 'draft_id,worker_id' })
        .select('send_id, worker_id')
      if (logErr) throw logErr
      const sendIdByWorker = new Map<number, number>(
        (sendLogRows ?? []).map((r) => [r.worker_id as number, r.send_id as number]),
      )

      const batch: OutboundSms[] = sendable.map(({ worker, to }, i) => ({
        to,
        body: resolved[i],
        sender: senderDigits,
        customRef: String(sendIdByWorker.get(worker.worker_id) ?? ''),
      }))

      const provider = await getSmsProvider()
      const firstId = sendable[0].item.item_id
      const lastId = sendable[sendable.length - 1].item.item_id
      const idempotencyKey = `sms-p2p-${lid}-${firstId}-${lastId}`
      let sendResults: SendResult[]
      try {
        sendResults = await provider.sendBatch(batch, { idempotencyKey })
      } catch (sendErr) {
        const reason =
          sendErr instanceof Error ? sendErr.message : 'Provider send failed'
        for (const { item } of sendable) {
          await supabase
            .from('sms_list_items')
            .update({ status: 'failed', failure_reason: reason })
            .eq('item_id', item.item_id)
            .eq('status', 'sending')
          results.push({ item_id: item.item_id, status: 'failed', conversation_id: null, error: reason })
        }
        return NextResponse.json({ error: reason }, { status: 502 })
      }

      // ── Conversations: create-or-attach on the exact thread key ──
      const successes = sendable
        .map((s, i) => ({ ...s, result: sendResults[i], body: resolved[i] }))
        .filter((s) => s.result?.status === 'success')

      const convByPhone = new Map<string, number>()
      const preExistingIds: number[] = []
      if (successes.length > 0) {
        const phones = [...new Set(successes.map((s) => s.to))]
        const { data: existingConvs, error: convSelErr } = await supabase
          .from('sms_conversations')
          .select('conversation_id, phone_e164, state')
          .eq('our_number_id', list.sender_number_id)
          .eq('campaign_id', cid)
          .in('phone_e164', phones)
        if (convSelErr) throw convSelErr
        for (const c of existingConvs ?? []) {
          convByPhone.set(c.phone_e164 as string, c.conversation_id as number)
          preExistingIds.push(c.conversation_id as number)
        }

        const missing = successes.filter((s) => !convByPhone.has(s.to))
        if (missing.length > 0) {
          const seen = new Set<string>()
          const rows = missing
            .filter((s) => (seen.has(s.to) ? false : (seen.add(s.to), true)))
            .map((s) => ({
              our_number_id: list.sender_number_id as number,
              phone_e164: s.to,
              worker_id: s.worker.worker_id,
              campaign_id: cid,
              state: 'messaged',
              last_message_at: sentAt,
              last_outbound_at: sentAt,
            }))
          // ignoreDuplicates (ON CONFLICT DO NOTHING): a thread created
          // between the select above and this insert (e.g. by an
          // inbound reply's webhook) must NOT have its state clobbered
          // to 'messaged' — raced keys are re-selected below and routed
          // through the no-regress update path instead.
          const { data: createdConvs, error: convInsErr } = await supabase
            .from('sms_conversations')
            .upsert(rows, {
              onConflict: 'our_number_id,phone_e164,campaign_id',
              ignoreDuplicates: true,
            })
            .select('conversation_id, phone_e164')
          if (convInsErr) throw convInsErr
          for (const c of createdConvs ?? []) {
            convByPhone.set(c.phone_e164 as string, c.conversation_id as number)
          }

          // Re-select the raced keys (rows skipped by DO NOTHING).
          const stillMissing = rows
            .map((r) => r.phone_e164)
            .filter((p) => !convByPhone.has(p))
          if (stillMissing.length > 0) {
            const { data: racedConvs, error: racedErr } = await supabase
              .from('sms_conversations')
              .select('conversation_id, phone_e164')
              .eq('our_number_id', list.sender_number_id)
              .eq('campaign_id', cid)
              .in('phone_e164', stillMissing)
            if (racedErr) throw racedErr
            for (const c of racedConvs ?? []) {
              convByPhone.set(c.phone_e164 as string, c.conversation_id as number)
              // Treat as pre-existing: guarded timestamps + state flip.
              preExistingIds.push(c.conversation_id as number)
            }
          }
        }

        // Pre-existing threads: forward-only timestamps + only
        // needs_message/closed flip to 'messaged' (an active convo /
        // needs_response state is never regressed).
        if (preExistingIds.length > 0) {
          const { error: tsErr } = await supabase
            .from('sms_conversations')
            .update({ last_message_at: sentAt, last_outbound_at: sentAt })
            .in('conversation_id', preExistingIds)
            .or(`last_message_at.is.null,last_message_at.lt.${sentAt}`)
          if (tsErr) throw tsErr
          const { error: stErr } = await supabase
            .from('sms_conversations')
            .update({ state: 'messaged' })
            .in('conversation_id', preExistingIds)
            .in('state', ['needs_message', 'closed'])
          if (stErr) throw stErr
        }

        // Message rows — idempotent on provider_message_id.
        const msgRows = successes
          .filter((s) => convByPhone.has(s.to))
          .map((s) => ({
            conversation_id: convByPhone.get(s.to) as number,
            direction: 'outbound',
            body: s.body,
            phone_e164: s.to,
            sender_user_id: user.id,
            provider_message_id: s.result?.providerMessageId ?? null,
            status: 'sent',
            segments: countSegments(s.body).segments,
            created_at: sentAt,
          }))
        if (msgRows.length > 0) {
          const { error: msgErr } = await supabase
            .from('sms_messages')
            .upsert(msgRows, {
              onConflict: 'provider_message_id',
              ignoreDuplicates: true,
            })
          if (msgErr) throw msgErr
        }
      }

      // ── Per-item results ──
      for (let i = 0; i < sendable.length; i += 1) {
        const { item, worker, to } = sendable[i]
        const result = sendResults[i]
        const sendId = sendIdByWorker.get(worker.worker_id)
        if (result?.status === 'success') {
          const conversationId = convByPhone.get(to) ?? null
          await supabase
            .from('sms_list_items')
            .update({
              status: 'sent',
              provider_message_id: result.providerMessageId,
              sent_at: sentAt,
              failure_reason: null,
              conversation_id: conversationId,
            })
            .eq('item_id', item.item_id)
          if (sendId) {
            await admin
              .from('sms_send_log')
              .update({
                status: 'sent',
                provider_message_id: result.providerMessageId,
                sent_at: sentAt,
                cost: result.cost ?? null,
              })
              .eq('send_id', sendId)
          }
          results.push({ item_id: item.item_id, status: 'sent', conversation_id: conversationId, error: null })
        } else if (result?.status === 'blocked') {
          await supabase
            .from('sms_list_items')
            .update({
              status: 'blocked',
              failure_reason: 'Recipient unsubscribed at provider',
            })
            .eq('item_id', item.item_id)
          if (sendId) {
            await admin
              .from('sms_send_log')
              .update({
                status: 'blocked',
                failure_reason: 'Recipient unsubscribed at provider',
              })
              .eq('send_id', sendId)
          }
          // Mirror the provider-side unsubscribe to the worker flag
          // (admin client — consent writes are compliance-critical).
          await admin
            .from('workers')
            .update({
              sms_opt_out: true,
              sms_opt_out_at: sentAt,
              sms_opt_out_source: 'inbound_stop',
            })
            .eq('worker_id', worker.worker_id)
            .eq('sms_opt_out', false)
          results.push({ item_id: item.item_id, status: 'blocked', conversation_id: null, error: 'Recipient unsubscribed at provider' })
        } else {
          const reason = result?.error ?? 'Provider send failed'
          await supabase
            .from('sms_list_items')
            .update({ status: 'failed', failure_reason: reason })
            .eq('item_id', item.item_id)
          if (sendId) {
            await admin
              .from('sms_send_log')
              .update({
                status: 'failed',
                failed_at: sentAt,
                failure_reason: reason,
              })
              .eq('send_id', sendId)
          }
          results.push({ item_id: item.item_id, status: 'failed', conversation_id: null, error: reason })
        }
      }
    }

    // Refresh list counters (count queries — never row fetches).
    const countByStatus = async (statuses: string[]): Promise<number> => {
      const { count } = await supabase
        .from('sms_list_items')
        .select('item_id', { count: 'exact', head: true })
        .eq('list_id', lid)
        .in('status', statuses)
      return count ?? 0
    }
    const [sentN, deliveredN, failedN] = await Promise.all([
      countByStatus(['sent']),
      countByStatus(['delivered']),
      countByStatus(['failed']),
    ])
    await supabase
      .from('sms_lists')
      .update({
        sent_items: sentN + deliveredN + failedN,
        delivered_items: deliveredN,
        failed_items: failedN,
      })
      .eq('list_id', lid)

    const tally = (status: ResultItem['status']) =>
      results.filter((r) => r.status === status).length
    return NextResponse.json({
      ok: true,
      sent: tally('sent'),
      failed: tally('failed'),
      blocked: tally('blocked'),
      opted_out: tally('opted_out'),
      skipped: tally('skipped'),
      results,
    })
  } catch (error) {
    console.error('POST sms-lists p2p-send error:', error)
    return errorResponse('Failed to send chat initials', error)
  }
}
