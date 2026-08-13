/**
 * SMS broadcast lists for a campaign.
 *
 * GET  — list rows merged with vw_sms_campaign_summary counts.
 * POST — create a new blast: campaign_comms_drafts shell (platform='sms')
 *        + sms_lists row. Audience is optional — omit it to draft the
 *        message first and attach a list later via POST .../audience.
 *
 * Mirrors /api/campaigns/[id]/email-lists plus the fire/sms populate
 * logic. RLS (can_write_to_campaign) applies through the user client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { isValidTimeZone } from '@/lib/sms/blackout'
import {
  audienceSourceFilters,
  isSmsApiAudience,
  populateSmsListItems,
  resolveAudienceWorkerIds,
  type SmsApiAudience,
} from '@/lib/sms/populate-sms-list'
import { inboxUnsafeSenderMessage } from '@/lib/sms/sender-purpose'
import { dedicatedNumberRequiredForNumberId } from '@/lib/sms/sender-inbound-server'

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
  /**
   * 'blast' (default) or 'p2p' — a p2p list is a chat-board working
   * list: it stays in status 'draft' while the board is active and is
   * sent progressively via the p2p-send route, never the cron.
   */
  mode?: 'blast' | 'p2p'
  /** Omit to create a draft and attach a list later. */
  audience?: SmsApiAudience
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
    const mode = body.mode === 'p2p' ? 'p2p' : 'blast'
    const audience = body.audience
    if (audience !== undefined && !isSmsApiAudience(audience)) {
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

    if (body.sender_number_id != null) {
      const unsafe = await inboxUnsafeSenderMessage(
        supabase,
        body.sender_number_id,
      )
      if (unsafe) {
        return NextResponse.json({ error: unsafe }, { status: 409 })
      }
      if (mode === 'p2p') {
        const notDedicated = await dedicatedNumberRequiredForNumberId(
          supabase,
          body.sender_number_id,
        )
        if (notDedicated) {
          return NextResponse.json({ error: notDedicated }, { status: 409 })
        }
      }
    }

    let workerIds: number[] = []
    if (audience) {
      const resolved = await resolveAudienceWorkerIds(supabase, cid, audience)
      if (resolved.error) {
        return NextResponse.json(
          { error: resolved.error.message },
          { status: resolved.error.status },
        )
      }
      workerIds = resolved.workerIds
      if (workerIds.length === 0) {
        return NextResponse.json(
          { error: 'Audience is empty — no workers found' },
          { status: 400 },
        )
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
        // Deploy-order safety: only send `mode` when non-default, so
        // blast creation keeps working if this code ships before the
        // 20260812140000 migration applies (column default is 'blast').
        ...(mode === 'p2p' ? { mode } : {}),
        source_filters: audience
          ? audienceSourceFilters(audience)
          : { source: 'deferred' },
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

    const populated =
      workerIds.length > 0
        ? await populateSmsListItems(supabase, smsList.list_id, workerIds)
        : { pendingCount: 0, optedOut: 0, skippedNoPhone: 0 }

    const { error: linkErr } = await supabase
      .from('campaign_comms_drafts')
      .update({ sms_list_id: smsList.list_id })
      .eq('draft_id', draft.draft_id)
    if (linkErr) throw linkErr

    return NextResponse.json(
      {
        sms_list_id: smsList.list_id,
        draft_id: draft.draft_id,
        total_items: populated.pendingCount,
        opted_out: populated.optedOut,
        skipped_no_phone: populated.skippedNoPhone,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST sms-lists error:', error)
    return errorResponse('Failed to create SMS blast', error)
  }
}
