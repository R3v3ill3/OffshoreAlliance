/**
 * SMS broadcast lists for a campaign.
 *
 * GET  — list rows merged with vw_sms_campaign_summary counts.
 * POST — create a new blast: campaign_comms_drafts shell (platform='sms')
 *        + sms_lists row + sms_list_items from the chosen audience
 *        (saved worker list or the whole campaign membership), with
 *        opt-out / missing-phone screening at populate time.
 *
 * Mirrors /api/campaigns/[id]/email-lists plus the fire/sms populate
 * logic. RLS (can_write_to_campaign) applies through the user client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { isValidTimeZone } from '@/lib/sms/blackout'

/** PostgREST caps responses at 1000 rows — page source reads. */
const PAGE_SIZE = 1000

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('vw_sms_campaign_summary')
      .select('*')
      .eq('campaign_id', cid)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET sms-lists error:', error)
    return errorResponse('Failed to fetch SMS lists', error)
  }
}

interface CreateBlastBody {
  name?: string
  body?: string
  sender_number_id?: number
  timezone?: string
  blackout_override?: boolean
  blackout_override_reason?: string
  scheduled_for?: string | null
  audience?:
    | { type: 'worker_list'; worker_list_id: number }
    | { type: 'campaign' }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as CreateBlastBody
    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const audience = body.audience
    if (
      !audience ||
      (audience.type !== 'worker_list' && audience.type !== 'campaign') ||
      (audience.type === 'worker_list' && !Number.isFinite(audience.worker_list_id))
    ) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
    }
    if (body.blackout_override && !body.blackout_override_reason?.trim()) {
      return NextResponse.json(
        { error: 'Blackout override requires a reason' },
        { status: 400 },
      )
    }
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      return NextResponse.json(
        { error: `Invalid timezone "${body.timezone}"` },
        { status: 400 },
      )
    }

    // Audience → ordered worker ids.
    const workerIds: number[] = []
    if (audience.type === 'worker_list') {
      const { data: wl, error: wlErr } = await supabase
        .from('campaign_worker_lists')
        .select('list_id, campaign_id')
        .eq('list_id', audience.worker_list_id)
        .maybeSingle()
      if (wlErr) throw wlErr
      if (!wl || wl.campaign_id !== cid) {
        return NextResponse.json({ error: 'Worker list not found' }, { status: 404 })
      }
      // Page: PostgREST caps at 1000 rows; large cohorts must not
      // silently truncate.
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: wlItems, error: wliErr } = await supabase
          .from('campaign_worker_list_items')
          .select('worker_id, sort_order')
          .eq('list_id', audience.worker_list_id)
          .order('sort_order', { ascending: true })
          .order('worker_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (wliErr) throw wliErr
        workerIds.push(...(wlItems ?? []).map((r) => r.worker_id))
        if (!wlItems || wlItems.length < PAGE_SIZE) break
      }
    } else {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: members, error: memErr } = await supabase
          .from('campaign_worker_membership')
          .select('worker_id')
          .eq('campaign_id', cid)
          .order('worker_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (memErr) throw memErr
        workerIds.push(...(members ?? []).map((r) => r.worker_id))
        if (!members || members.length < PAGE_SIZE) break
      }
    }
    if (workerIds.length === 0) {
      return NextResponse.json(
        { error: 'Audience is empty — no workers found' },
        { status: 400 },
      )
    }

    // Consent + phone screening (chunked to keep .in() bounded).
    const workerById = new Map<
      number,
      { phone_e164: string | null; sms_opt_out: boolean }
    >()
    for (let i = 0; i < workerIds.length; i += 500) {
      const chunk = workerIds.slice(i, i + 500)
      const { data: workers, error: wErr } = await supabase
        .from('workers')
        .select('worker_id, phone_e164, sms_opt_out')
        .in('worker_id', chunk)
      if (wErr) throw wErr
      for (const w of workers ?? []) {
        workerById.set(w.worker_id, {
          phone_e164: w.phone_e164,
          sms_opt_out: !!w.sms_opt_out,
        })
      }
    }

    // Draft shell (stage: active stage or 1, mirroring fire routes).
    const { data: stagePlans, error: stageErr } = await supabase
      .from('campaign_stage_plans')
      .select('stage_number, status')
      .eq('campaign_id', cid)
    if (stageErr) throw stageErr
    const stageNumber =
      stagePlans?.find((s) => s.status === 'active')?.stage_number ?? 1

    const { data: draft, error: draftErr } = await supabase
      .from('campaign_comms_drafts')
      .insert({
        campaign_id: cid,
        stage_number: stageNumber,
        platform: 'sms',
        status: 'draft',
        title: name,
        body: body.body ?? '',
        created_by: user.id,
      })
      .select('draft_id')
      .single()
    if (draftErr) throw draftErr

    const { data: smsList, error: listErr } = await supabase
      .from('sms_lists')
      .insert({
        campaign_id: cid,
        draft_id: draft.draft_id,
        name,
        status: 'draft',
        source_filters:
          audience.type === 'worker_list'
            ? { source: 'worker_list', list_id: audience.worker_list_id }
            : { source: 'campaign' },
        sender_number_id: body.sender_number_id ?? null,
        timezone: body.timezone || 'Australia/Perth',
        blackout_override: !!body.blackout_override,
        blackout_override_reason: body.blackout_override
          ? (body.blackout_override_reason?.trim() ?? null)
          : null,
        scheduled_for: body.scheduled_for ?? null,
        created_by: user.id,
      })
      .select('list_id')
      .single()
    if (listErr) throw listErr

    const itemRows = workerIds.map((workerId, i) => {
      const w = workerById.get(workerId)
      const optedOut = !!w?.sms_opt_out
      const phone = w?.phone_e164 ?? null
      return {
        list_id: smsList.list_id,
        worker_id: workerId,
        phone_e164: phone,
        sort_order: i,
        status: optedOut ? 'opted_out' : phone ? 'pending' : 'skipped',
        failure_reason: optedOut
          ? 'Worker has opted out of SMS'
          : phone
            ? null
            : 'No mobile number on file',
      }
    })
    for (let i = 0; i < itemRows.length; i += 500) {
      const { error: insErr } = await supabase
        .from('sms_list_items')
        .insert(itemRows.slice(i, i + 500))
      if (insErr) throw insErr
    }

    const pendingCount = itemRows.filter((r) => r.status === 'pending').length
    const { error: totalErr } = await supabase
      .from('sms_lists')
      .update({ total_items: pendingCount })
      .eq('list_id', smsList.list_id)
    if (totalErr) throw totalErr

    const { error: linkErr } = await supabase
      .from('campaign_comms_drafts')
      .update({ sms_list_id: smsList.list_id })
      .eq('draft_id', draft.draft_id)
    if (linkErr) throw linkErr

    return NextResponse.json(
      {
        sms_list_id: smsList.list_id,
        draft_id: draft.draft_id,
        total_items: pendingCount,
        opted_out: itemRows.filter((r) => r.status === 'opted_out').length,
        skipped_no_phone: itemRows.filter((r) => r.status === 'skipped').length,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST sms-lists error:', error)
    return errorResponse('Failed to create SMS blast', error)
  }
}
