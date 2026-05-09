import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function assertList(
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
  if (!data || data.campaign_id !== campaignId) {
    return { ok: false as const, status: 404, message: 'List not found' }
  }
  return { ok: true as const }
}

export async function POST(
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

    const guard = await assertList(supabase, cid, lid)
    if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

    const body = await req.json()
    const workerIds: unknown = body?.worker_ids
    const sourceOuId: number | null =
      typeof body?.source_ou_id === 'number' ? body.source_ou_id : null

    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      return NextResponse.json({ error: 'worker_ids[] required' }, { status: 400 })
    }
    const ids = workerIds.filter((n): n is number => typeof n === 'number')
    if (ids.length === 0) {
      return NextResponse.json({ error: 'worker_ids[] empty after filter' }, { status: 400 })
    }

    // Determine current max sort_order to append at the bottom.
    const { data: existing, error: existingErr } = await supabase
      .from('campaign_worker_list_items')
      .select('worker_id, sort_order')
      .eq('list_id', lid)
    if (existingErr) throw existingErr

    const have = new Set((existing ?? []).map((r) => r.worker_id))
    const fresh = ids.filter((id) => !have.has(id))
    const maxSort =
      (existing ?? []).reduce((m, r) => (r.sort_order > m ? r.sort_order : m), -1) + 1

    if (fresh.length === 0) {
      return NextResponse.json({ added: 0, skipped: ids.length, items: [] })
    }

    const rows = fresh.map((wid, i) => ({
      list_id: lid,
      worker_id: wid,
      sort_order: maxSort + i,
      source_ou_id: sourceOuId,
    }))

    const { data: inserted, error: insErr } = await supabase
      .from('campaign_worker_list_items')
      .insert(rows)
      .select()

    if (insErr) throw insErr

    // Touch parent updated_at so the list reflows in the picker.
    await supabase
      .from('campaign_worker_lists')
      .update({ updated_at: new Date().toISOString() })
      .eq('list_id', lid)

    return NextResponse.json(
      { added: inserted?.length ?? 0, skipped: ids.length - fresh.length, items: inserted ?? [] },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST worker-list items error:', error)
    return NextResponse.json({ error: 'Failed to add items' }, { status: 500 })
  }
}

export async function DELETE(
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

    const guard = await assertList(supabase, cid, lid)
    if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

    const body = await req.json().catch(() => null)
    const workerIds: unknown = body?.worker_ids
    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      return NextResponse.json({ error: 'worker_ids[] required' }, { status: 400 })
    }
    const ids = workerIds.filter((n): n is number => typeof n === 'number')

    const { error } = await supabase
      .from('campaign_worker_list_items')
      .delete()
      .eq('list_id', lid)
      .in('worker_id', ids)

    if (error) throw error

    await supabase
      .from('campaign_worker_lists')
      .update({ updated_at: new Date().toISOString() })
      .eq('list_id', lid)

    return NextResponse.json({ ok: true, removed: ids.length })
  } catch (error) {
    console.error('DELETE worker-list items error:', error)
    return NextResponse.json({ error: 'Failed to remove items' }, { status: 500 })
  }
}
