/**
 * POST /api/campaigns/[id]/sms-lists/[listId]/audience — attach an
 * audience to a draft blast/chat that was created without one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import {
  audienceSourceFilters,
  isSmsApiAudience,
  populateSmsListItems,
  resolveAudienceWorkerIds,
} from '@/lib/sms/populate-sms-list'

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

    const body = (await req.json()) as { audience?: unknown }
    if (!isSmsApiAudience(body.audience)) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
    }

    const { data: list, error: listErr } = await supabase
      .from('sms_lists')
      .select('list_id, campaign_id, status')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }
    if (list.status !== 'draft') {
      return NextResponse.json(
        { error: 'Audience can only be attached to a draft' },
        { status: 409 },
      )
    }

    const { count, error: countErr } = await supabase
      .from('sms_list_items')
      .select('item_id', { count: 'exact', head: true })
      .eq('list_id', lid)
    if (countErr) throw countErr
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'This blast already has an audience' },
        { status: 409 },
      )
    }

    const resolved = await resolveAudienceWorkerIds(supabase, cid, body.audience)
    if (resolved.error) {
      return NextResponse.json(
        { error: resolved.error.message },
        { status: resolved.error.status },
      )
    }
    if (resolved.workerIds.length === 0) {
      return NextResponse.json(
        { error: 'Audience is empty — no workers found' },
        { status: 400 },
      )
    }

    const populated = await populateSmsListItems(
      supabase,
      lid,
      resolved.workerIds,
    )

    const { error: filtersErr } = await supabase
      .from('sms_lists')
      .update({ source_filters: audienceSourceFilters(body.audience) })
      .eq('list_id', lid)
    if (filtersErr) throw filtersErr

    return NextResponse.json({
      sms_list_id: lid,
      total_items: populated.pendingCount,
      opted_out: populated.optedOut,
      skipped_no_phone: populated.skippedNoPhone,
    })
  } catch (error) {
    console.error('POST sms-list audience error:', error)
    return errorResponse('Failed to attach audience', error)
  }
}
