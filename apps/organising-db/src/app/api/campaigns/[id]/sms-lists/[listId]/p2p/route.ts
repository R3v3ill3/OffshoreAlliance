/**
 * P2P chat board data + membership for a mode='p2p' sms_list.
 *
 * GET   — board payload: list meta (+ sender), draft template, items
 *         joined with worker (name/occupation/employer/opt-out) and the
 *         linked conversation's state/unread, plus the campaign
 *         merge-field base context for client-side previews.
 * POST  — "Add people" mid-session: insert more items from worker_ids
 *         and/or a worker_list / whole-campaign audience, deduped on
 *         UNIQUE(list_id, worker_id). New rows screen opt-out/no-phone
 *         exactly like blast creation.
 * PATCH — { action: 'close' }: board finished → list status 'sent',
 *         remaining pending items → skipped ("Chat board closed").
 *         { action: 'set_item_body', item_id, body }: save (or clear)
 *         a per-person initiating message. NULL/identical-to-default
 *         falls back to the board draft. Only pending/failed rows.
 *         { action: 'set_board_body', body }: rewrite the board's
 *         shared opener mid-session — sample a few, take the feedback,
 *         edit, then send the rest. Sent rows are unaffected.
 *
 * P2P list state model: 'draft' while the board is active, 'sent' when
 * closed. P2P lists never enter 'queued'/'sending', so the dispatch
 * cron (which drains those statuses) can never touch them; the cron and
 * the queue action both carry additional mode belts.
 *
 * RLS (can_write_to_campaign) applies through the user client for all
 * writes; GET is read-only for authenticated staff.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { loadCampaignEmailContext } from '@/lib/comms/campaign-email-context'
import { validateSmsBody } from '@/lib/sms/compliance'
import {
  P2P_SENDABLE_STATUSES,
  p2pBodyOverrideToStore,
} from '@/lib/sms/p2p'

const PAGE_SIZE = 1000

interface ListRow {
  list_id: number
  campaign_id: number
  name: string
  status: string
  mode?: string
  draft_id: number | null
  sender_number_id: number | null
  timezone: string | null
  created_at: string
}

async function loadP2pList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cid: number,
  lid: number,
): Promise<{ list: ListRow } | { error: NextResponse }> {
  const { data: list, error } = await supabase
    .from('sms_lists')
    .select(
      'list_id, campaign_id, name, status, mode, draft_id, sender_number_id, timezone, created_at',
    )
    .eq('list_id', lid)
    .maybeSingle()
  if (error) throw error
  if (!list || list.campaign_id !== cid) {
    return {
      error: NextResponse.json({ error: 'List not found' }, { status: 404 }),
    }
  }
  if ((list.mode ?? 'blast') !== 'p2p') {
    return {
      error: NextResponse.json(
        { error: 'Not a P2P chat board' },
        { status: 400 },
      ),
    }
  }
  return { list: list as ListRow }
}

export async function GET(
  _req: NextRequest,
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

    const loaded = await loadP2pList(supabase, cid, lid)
    if ('error' in loaded) return loaded.error
    const { list } = loaded

    let sender: { phone_e164: string; label: string | null } | null = null
    if (list.sender_number_id != null) {
      const { data } = await supabase
        .from('sms_numbers')
        .select('phone_e164, label')
        .eq('number_id', list.sender_number_id)
        .maybeSingle()
      sender = data ?? null
    }

    let draft: { draft_id: number; body: string } | null = null
    if (list.draft_id != null) {
      const { data } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, body')
        .eq('draft_id', list.draft_id)
        .maybeSingle()
      draft = data ? { draft_id: data.draft_id, body: data.body ?? '' } : null
    }

    // Items + worker + linked conversation, paged past the 1000 cap.
    interface RawItem {
      item_id: number
      worker_id: number
      phone_e164: string | null
      sort_order: number
      status: string
      failure_reason: string | null
      sent_at: string | null
      conversation_id: number | null
      body_override: string | null
      worker: {
        worker_id: number
        first_name: string
        last_name: string
        occupation: string | null
        phone_e164: string | null
        sms_opt_out: boolean
        employer: { employer_id: number; employer_name: string } | null
      } | null
      conversation: {
        conversation_id: number
        state: string
        unread_count: number
        last_inbound_at: string | null
        closed_at: string | null
      } | null
    }
    const rawItems: RawItem[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sms_list_items')
        .select(
          `item_id, worker_id, phone_e164, sort_order, status, failure_reason,
           sent_at, conversation_id, body_override,
           worker:workers(worker_id, first_name, last_name, occupation,
             phone_e164, sms_opt_out,
             employer:employers(employer_id, employer_name)),
           conversation:sms_conversations(conversation_id, state, unread_count,
             last_inbound_at, closed_at)`,
        )
        .eq('list_id', lid)
        .order('sort_order', { ascending: true })
        .order('item_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      rawItems.push(...((data ?? []) as unknown as RawItem[]))
      if (!data || data.length < PAGE_SIZE) break
    }

    const items = rawItems.map((r) => ({
      item_id: r.item_id,
      worker_id: r.worker_id,
      worker_name: r.worker
        ? `${r.worker.first_name} ${r.worker.last_name}`.trim()
        : `Worker #${r.worker_id}`,
      first_name: r.worker?.first_name ?? '',
      last_name: r.worker?.last_name ?? '',
      occupation: r.worker?.occupation ?? null,
      employer_name: r.worker?.employer?.employer_name ?? null,
      phone_e164: r.phone_e164 ?? r.worker?.phone_e164 ?? null,
      sort_order: r.sort_order,
      status: r.status,
      failure_reason: r.failure_reason,
      sent_at: r.sent_at,
      sms_opt_out: !!r.worker?.sms_opt_out,
      conversation_id: r.conversation_id,
      conversation_state: r.conversation?.state ?? null,
      unread_count: r.conversation?.unread_count ?? 0,
      // Drives the board's responded/completed counters and the
      // closed-to-the-bottom sort.
      last_inbound_at: r.conversation?.last_inbound_at ?? null,
      closed_at: r.conversation?.closed_at ?? null,
      body_override: r.body_override?.trim() ? r.body_override : null,
    }))

    const mergeContext = await loadCampaignEmailContext(
      supabase,
      cid,
      user.email ?? undefined,
    )

    return NextResponse.json({
      list: {
        list_id: list.list_id,
        campaign_id: list.campaign_id,
        name: list.name,
        status: list.status,
        mode: 'p2p',
        sender_number_id: list.sender_number_id,
        sender_phone_e164: sender?.phone_e164 ?? null,
        sender_label: sender?.label ?? null,
        timezone: list.timezone || 'Australia/Perth',
        created_at: list.created_at,
      },
      draft,
      items,
      merge_context: mergeContext,
    })
  } catch (error) {
    console.error('GET sms-lists p2p error:', error)
    return errorResponse('Failed to load chat board', error)
  }
}

interface AddPeopleBody {
  worker_ids?: number[]
  audience?:
    | { type: 'worker_list'; worker_list_id: number }
    | { type: 'campaign' }
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

    const loaded = await loadP2pList(supabase, cid, lid)
    if ('error' in loaded) return loaded.error
    const { list } = loaded
    if (list.status !== 'draft') {
      return NextResponse.json(
        { error: 'This chat board is closed — reopen is not supported' },
        { status: 409 },
      )
    }

    const body = (await req.json()) as AddPeopleBody
    const workerIds: number[] = []
    if (Array.isArray(body.worker_ids)) {
      workerIds.push(
        ...body.worker_ids.filter((n): n is number => Number.isFinite(n)),
      )
    }
    if (body.audience?.type === 'worker_list') {
      const wlId = body.audience.worker_list_id
      const { data: wl, error: wlErr } = await supabase
        .from('campaign_worker_lists')
        .select('list_id, campaign_id')
        .eq('list_id', wlId)
        .maybeSingle()
      if (wlErr) throw wlErr
      if (!wl || wl.campaign_id !== cid) {
        return NextResponse.json({ error: 'Worker list not found' }, { status: 404 })
      }
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('campaign_worker_list_items')
          .select('worker_id, sort_order')
          .eq('list_id', wlId)
          .order('sort_order', { ascending: true })
          .order('worker_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        workerIds.push(...(data ?? []).map((r) => r.worker_id))
        if (!data || data.length < PAGE_SIZE) break
      }
    } else if (body.audience?.type === 'campaign') {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('campaign_worker_membership')
          .select('worker_id')
          .eq('campaign_id', cid)
          .order('worker_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        workerIds.push(...(data ?? []).map((r) => r.worker_id))
        if (!data || data.length < PAGE_SIZE) break
      }
    }

    const uniqueIds = [...new Set(workerIds)]
    if (uniqueIds.length === 0) {
      return NextResponse.json({ error: 'No workers to add' }, { status: 400 })
    }

    // Dedupe against existing membership (UNIQUE(list_id, worker_id)).
    const existing = new Set<number>()
    for (let i = 0; i < uniqueIds.length; i += 500) {
      const { data, error } = await supabase
        .from('sms_list_items')
        .select('worker_id')
        .eq('list_id', lid)
        .in('worker_id', uniqueIds.slice(i, i + 500))
      if (error) throw error
      for (const r of data ?? []) existing.add(r.worker_id)
    }
    const newIds = uniqueIds.filter((w) => !existing.has(w))
    if (newIds.length === 0) {
      return NextResponse.json({ ok: true, added: 0, already_on_board: uniqueIds.length })
    }

    const workerById = new Map<
      number,
      { phone_e164: string | null; sms_opt_out: boolean }
    >()
    for (let i = 0; i < newIds.length; i += 500) {
      const { data, error } = await supabase
        .from('workers')
        .select('worker_id, phone_e164, sms_opt_out')
        .in('worker_id', newIds.slice(i, i + 500))
      if (error) throw error
      for (const w of data ?? []) {
        workerById.set(w.worker_id, {
          phone_e164: w.phone_e164,
          sms_opt_out: !!w.sms_opt_out,
        })
      }
    }

    const { data: maxRow } = await supabase
      .from('sms_list_items')
      .select('sort_order')
      .eq('list_id', lid)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const base = (maxRow?.sort_order ?? -1) + 1

    const rows = newIds.map((workerId, i) => {
      const w = workerById.get(workerId)
      const optedOut = !!w?.sms_opt_out
      const phone = w?.phone_e164 ?? null
      return {
        list_id: lid,
        worker_id: workerId,
        phone_e164: phone,
        sort_order: base + i,
        status: optedOut ? 'opted_out' : phone ? 'pending' : 'skipped',
        failure_reason: optedOut
          ? 'Worker has opted out of SMS'
          : phone
            ? null
            : 'No mobile number on file',
      }
    })
    for (let i = 0; i < rows.length; i += 500) {
      // Upsert-with-ignore: a concurrent add of the same worker must not
      // fail the whole batch.
      const { error } = await supabase
        .from('sms_list_items')
        .upsert(rows.slice(i, i + 500), {
          onConflict: 'list_id,worker_id',
          ignoreDuplicates: true,
        })
      if (error) throw error
    }

    return NextResponse.json({
      ok: true,
      added: rows.length,
      already_on_board: uniqueIds.length - rows.length,
      opted_out: rows.filter((r) => r.status === 'opted_out').length,
      skipped_no_phone: rows.filter((r) => r.status === 'skipped').length,
    })
  } catch (error) {
    console.error('POST sms-lists p2p error:', error)
    return errorResponse('Failed to add people to chat board', error)
  }
}

export async function PATCH(
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

    const loaded = await loadP2pList(supabase, cid, lid)
    if ('error' in loaded) return loaded.error
    const { list } = loaded

    const payload = (await req.json()) as {
      action?: string
      item_id?: number
      body?: string | null
    }
    // Rewrite the board's shared opener mid-session: send to a small
    // sample, take the feedback, then edit before the next batch.
    // Already-sent rows keep the text they went out with (sms_messages
    // stores the rendered body), and per-person overrides still win —
    // an override equal to the old template was stored as NULL, so
    // those rows correctly pick up the new wording.
    if (payload.action === 'set_board_body') {
      if (list.status !== 'draft') {
        return NextResponse.json(
          { error: 'This chat board is closed' },
          { status: 409 },
        )
      }
      if (list.draft_id == null) {
        return NextResponse.json(
          { error: 'Board has no message draft' },
          { status: 400 },
        )
      }
      const next = typeof payload.body === 'string' ? payload.body.trim() : ''
      if (!next) {
        return NextResponse.json(
          { error: 'Message body cannot be empty' },
          { status: 400 },
        )
      }
      const compliance = validateSmsBody(next)
      if (!compliance.ok) {
        return NextResponse.json(
          { error: compliance.errors.join(' ') },
          { status: 400 },
        )
      }

      // Nothing in the schema stops two lists pointing at one draft
      // (no UNIQUE on sms_lists.draft_id). Boards each create their own
      // today, but editing in place would silently rewrite the other
      // list's message — refuse rather than surprise someone.
      const { data: sharers, error: shareErr } = await supabase
        .from('sms_lists')
        .select('list_id')
        .eq('draft_id', list.draft_id)
        .neq('list_id', lid)
        .limit(1)
      if (shareErr) throw shareErr
      if ((sharers ?? []).length > 0) {
        return NextResponse.json(
          {
            error:
              'This message draft is shared with another send list, so editing it here would change that one too.',
          },
          { status: 409 },
        )
      }

      const { error: draftErr } = await supabase
        .from('campaign_comms_drafts')
        .update({ body: next })
        .eq('draft_id', list.draft_id)
      if (draftErr) throw draftErr

      return NextResponse.json({ ok: true, body: next })
    }

    if (payload.action === 'set_item_body') {
      if (list.status !== 'draft') {
        return NextResponse.json(
          { error: 'This chat board is closed' },
          { status: 409 },
        )
      }
      const itemId = payload.item_id
      if (!Number.isFinite(itemId)) {
        return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
      }

      const { data: item, error: itemErr } = await supabase
        .from('sms_list_items')
        .select('item_id, status')
        .eq('list_id', lid)
        .eq('item_id', itemId as number)
        .maybeSingle()
      if (itemErr) throw itemErr
      if (!item) {
        return NextResponse.json({ error: 'Person not on this board' }, { status: 404 })
      }
      if (!(P2P_SENDABLE_STATUSES as readonly string[]).includes(item.status)) {
        return NextResponse.json(
          { error: 'Can only edit the opener before it is sent' },
          { status: 409 },
        )
      }

      let boardTemplate = ''
      if (list.draft_id != null) {
        const { data: draft } = await supabase
          .from('campaign_comms_drafts')
          .select('body')
          .eq('draft_id', list.draft_id)
          .maybeSingle()
        boardTemplate = draft?.body ?? ''
      }
      const bodyOverride = p2pBodyOverrideToStore(
        boardTemplate,
        typeof payload.body === 'string' ? payload.body : '',
      )

      const { error: updErr } = await supabase
        .from('sms_list_items')
        .update({ body_override: bodyOverride })
        .eq('item_id', itemId as number)
        .eq('list_id', lid)
      if (updErr) throw updErr

      return NextResponse.json({ ok: true, body_override: bodyOverride })
    }

    if (payload.action !== 'close') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    if (list.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot close a board with status "${list.status}"` },
        { status: 409 },
      )
    }

    const { error: itemsErr } = await supabase
      .from('sms_list_items')
      .update({ status: 'skipped', failure_reason: 'Chat board closed' })
      .eq('list_id', lid)
      .eq('status', 'pending')
    if (itemsErr) throw itemsErr

    const { error: listErr } = await supabase
      .from('sms_lists')
      .update({ status: 'sent' })
      .eq('list_id', lid)
    if (listErr) throw listErr

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH sms-lists p2p error:', error)
    return errorResponse('Failed to update chat board', error)
  }
}
