/**
 * SMS list detail + draft editing.
 *
 * GET   — list row + draft body + sender number + items with worker names.
 * PATCH — edit while status='draft': name, body (writes through to the
 *         linked draft), sender, timezone, blackout override (+ required
 *         reason), schedule. While status='paused' ONLY schedule tweaks
 *         are allowed (scheduled_for / timezone / blackout override) —
 *         body, name and sender edits are rejected so queued content
 *         cannot be swapped past the queue action's compliance check
 *         via pause → edit → resume. (The dispatcher re-validates the
 *         body as a second belt.)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { isValidTimeZone } from '@/lib/sms/blackout'
import { inboxUnsafeSenderMessage } from '@/lib/sms/sender-purpose'

async function loadList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cid: number,
  lid: number,
) {
  const { data: list, error } = await supabase
    .from('sms_lists')
    .select('*')
    .eq('list_id', lid)
    .maybeSingle()
  if (error) throw error
  if (!list || list.campaign_id !== cid) return null
  return list as Record<string, unknown> & {
    list_id: number
    campaign_id: number
    draft_id: number | null
    status: string
    blackout_override: boolean
  }
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

    const list = await loadList(supabase, cid, lid)
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

    let draft: { draft_id: number; body: string; status: string } | null = null
    if (list.draft_id) {
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, body, status')
        .eq('draft_id', list.draft_id)
        .maybeSingle()
      if (error) throw error
      draft = data
    }

    const { data: items, error: itemsErr } = await supabase
      .from('sms_list_items')
      .select(
        'item_id, worker_id, phone_e164, sort_order, status, failure_reason, sent_at, delivered_at, send_before, workers!inner(first_name, last_name)',
      )
      .eq('list_id', lid)
      .order('sort_order', { ascending: true })
    if (itemsErr) throw itemsErr

    interface ItemRow {
      item_id: number
      worker_id: number
      phone_e164: string | null
      sort_order: number
      status: string
      failure_reason: string | null
      sent_at: string | null
      delivered_at: string | null
      send_before: string | null
      workers:
        | { first_name: string; last_name: string }
        | { first_name: string; last_name: string }[]
        | null
    }
    const flatItems = ((items ?? []) as ItemRow[]).map((it) => {
      const w = Array.isArray(it.workers) ? it.workers[0] : it.workers
      return {
        item_id: it.item_id,
        worker_id: it.worker_id,
        worker_name: w ? `${w.first_name} ${w.last_name}`.trim() : `#${it.worker_id}`,
        phone_e164: it.phone_e164,
        sort_order: it.sort_order,
        status: it.status,
        failure_reason: it.failure_reason,
        sent_at: it.sent_at,
        delivered_at: it.delivered_at,
        send_before: it.send_before,
      }
    })

    return NextResponse.json({ list, draft, items: flatItems })
  } catch (error) {
    console.error('GET sms-list detail error:', error)
    return errorResponse('Failed to fetch SMS list', error)
  }
}

interface PatchBody {
  name?: string
  body?: string
  sender_number_id?: number | null
  timezone?: string
  blackout_override?: boolean
  blackout_override_reason?: string | null
  scheduled_for?: string | null
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

    const list = await loadList(supabase, cid, lid)
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })
    if (list.status !== 'draft' && list.status !== 'paused') {
      return NextResponse.json(
        { error: `Cannot edit a list with status "${list.status}"` },
        { status: 409 },
      )
    }

    const body = (await req.json()) as PatchBody

    // Paused lists: schedule-only edits. Content/sender changes would
    // bypass the compliance validation performed at queue time.
    if (list.status === 'paused') {
      const blockedFields = (['name', 'body', 'sender_number_id'] as const).filter(
        (k) => body[k] !== undefined,
      )
      if (blockedFields.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot edit ${blockedFields.join(', ')} while paused — cancel the blast and create a new one to change the message`,
          },
          { status: 409 },
        )
      }
    }

    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      return NextResponse.json(
        { error: `Invalid timezone "${body.timezone}"` },
        { status: 400 },
      )
    }

    const listUpdate: Record<string, unknown> = {}
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      }
      listUpdate.name = body.name.trim()
    }
    if (body.sender_number_id !== undefined) {
      if (body.sender_number_id != null) {
        const unsafe = await inboxUnsafeSenderMessage(
          supabase,
          body.sender_number_id,
        )
        if (unsafe) {
          return NextResponse.json({ error: unsafe }, { status: 409 })
        }
      }
      listUpdate.sender_number_id = body.sender_number_id
    }
    if (body.timezone !== undefined) listUpdate.timezone = body.timezone
    if (body.blackout_override !== undefined) {
      if (body.blackout_override && !body.blackout_override_reason?.trim()) {
        return NextResponse.json(
          { error: 'Blackout override requires a reason' },
          { status: 400 },
        )
      }
      listUpdate.blackout_override = body.blackout_override
      listUpdate.blackout_override_reason = body.blackout_override
        ? (body.blackout_override_reason?.trim() ?? null)
        : null
    }
    if (body.scheduled_for !== undefined) listUpdate.scheduled_for = body.scheduled_for

    if (Object.keys(listUpdate).length > 0) {
      const { error } = await supabase
        .from('sms_lists')
        .update(listUpdate)
        .eq('list_id', lid)
      if (error) throw error
    }

    if (body.body !== undefined && list.draft_id) {
      const { error } = await supabase
        .from('campaign_comms_drafts')
        .update({ body: body.body })
        .eq('draft_id', list.draft_id)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH sms-list error:', error)
    return errorResponse('Failed to update SMS list', error)
  }
}
