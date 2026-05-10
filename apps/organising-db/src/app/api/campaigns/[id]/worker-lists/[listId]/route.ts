import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function loadListAndAssertCampaign(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: number,
  listId: number
) {
  const { data, error } = await supabase
    .from('campaign_worker_lists')
    .select('list_id, campaign_id')
    .eq('list_id', listId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { ok: false as const, status: 404, message: 'List not found' }
  if (data.campaign_id !== campaignId) {
    return { ok: false as const, status: 404, message: 'List not found in this campaign' }
  }
  return { ok: true as const }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // List shell + items query run in parallel — they don't depend on each
    // other. The ratings query has to follow because it needs worker_ids.
    const [listRes, itemsRes] = await Promise.all([
      supabase
        .from('campaign_worker_lists')
        .select(
          `list_id, campaign_id, name, description, default_purpose, status,
           leader_worker_id, leader_organiser_id, source,
           fired_call_list_id, fired_draft_id, fired_task_list_id, fired_at,
           created_by, created_at, updated_at,
           leader_worker:workers!campaign_worker_lists_leader_worker_id_fkey(
             worker_id, first_name, last_name
           )`
        )
        .eq('list_id', lid)
        .single(),
      supabase
        .from('campaign_worker_list_items')
        .select(
          `id, list_id, worker_id, sort_order, source_ou_id, added_at,
           worker:workers!worker_id(
             worker_id, first_name, last_name, email, phone,
             is_hsr, is_bargaining_rep,
             member_role_type:member_role_types(role_type_id, role_name, display_name)
           ),
           source_ou:campaign_organising_units!source_ou_id(ou_id, name, ou_type)`
        )
        .eq('list_id', lid)
        .order('sort_order', { ascending: true }),
    ])

    if (listRes.error) throw listRes.error
    const list = listRes.data
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }
    if (itemsRes.error) throw itemsRes.error
    const items = itemsRes.data

    // Hydrate cumulative rating from the rating summary view.
    const workerIds = (items ?? []).map((i) => i.worker_id)
    let ratingByWorker = new Map<number, number | null>()
    if (workerIds.length > 0) {
      const { data: ratings } = await supabase
        .from('campaign_worker_rating_summary')
        .select('worker_id, cumulative_rating')
        .eq('campaign_id', cid)
        .in('worker_id', workerIds)
      ratingByWorker = new Map(
        (ratings ?? []).map((r) => [r.worker_id, r.cumulative_rating])
      )
    }

    return NextResponse.json({
      ...list,
      items: (items ?? []).map((i) => ({
        ...i,
        cumulative_rating: ratingByWorker.get(i.worker_id) ?? null,
      })),
    })
  } catch (error) {
    console.error('GET worker-list error:', error)
    return NextResponse.json({ error: 'Failed to fetch worker list' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const guard = await loadListAndAssertCampaign(supabase, cid, lid)
    if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

    const body = await req.json()
    const allowed = [
      'name',
      'description',
      'default_purpose',
      'status',
      'leader_worker_id',
      'leader_organiser_id',
    ] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    if (
      'default_purpose' in updates &&
      updates.default_purpose != null &&
      !['email', 'phone', 'task'].includes(updates.default_purpose as string)
    ) {
      return NextResponse.json({ error: 'Invalid default_purpose' }, { status: 400 })
    }
    if (
      'status' in updates &&
      !['draft', 'fired', 'archived'].includes(updates.status as string)
    ) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    // Mutually exclusive: a list has one leader at most.
    if (updates.leader_worker_id != null && updates.leader_organiser_id != null) {
      return NextResponse.json(
        { error: 'leader_worker_id and leader_organiser_id are mutually exclusive' },
        { status: 400 }
      )
    }
    if (updates.leader_worker_id !== undefined && updates.leader_worker_id != null) {
      updates.leader_organiser_id = null
    } else if (updates.leader_organiser_id !== undefined && updates.leader_organiser_id != null) {
      updates.leader_worker_id = null
    }

    const { data, error } = await supabase
      .from('campaign_worker_lists')
      .update(updates)
      .eq('list_id', lid)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH worker-list error:', error)
    return NextResponse.json({ error: 'Failed to update worker list' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const guard = await loadListAndAssertCampaign(supabase, cid, lid)
    if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

    const { error } = await supabase
      .from('campaign_worker_lists')
      .delete()
      .eq('list_id', lid)
      .eq('campaign_id', cid)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE worker-list error:', error)
    return NextResponse.json({ error: 'Failed to delete worker list' }, { status: 500 })
  }
}
