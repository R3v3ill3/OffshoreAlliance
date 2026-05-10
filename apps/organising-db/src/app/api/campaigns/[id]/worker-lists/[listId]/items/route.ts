import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Run the campaign-scope check + max-sort lookup in parallel. The
    // previous implementation pulled every existing item from the list to
    // dedupe in JS; we now lean on the (list_id, worker_id) UNIQUE constraint
    // and `ignoreDuplicates` in the upsert below, so this stays O(1) on the
    // list size.
    const [scopeRes, maxRes] = await Promise.all([
      supabase
        .from('campaign_worker_lists')
        .select('list_id, campaign_id')
        .eq('list_id', lid)
        .maybeSingle(),
      supabase
        .from('campaign_worker_list_items')
        .select('sort_order')
        .eq('list_id', lid)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (scopeRes.error) throw scopeRes.error
    if (!scopeRes.data || scopeRes.data.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }
    if (maxRes.error) throw maxRes.error

    const startSort = (maxRes.data?.sort_order ?? -1) + 1

    const rows = ids.map((wid, i) => ({
      list_id: lid,
      worker_id: wid,
      sort_order: startSort + i,
      source_ou_id: sourceOuId,
    }))

    // Upsert with ignoreDuplicates so existing (list_id, worker_id) pairs
    // are silently skipped without a separate read. .select() returns only
    // the rows actually inserted.
    const { data: inserted, error: insErr } = await supabase
      .from('campaign_worker_list_items')
      .upsert(rows, { onConflict: 'list_id,worker_id', ignoreDuplicates: true })
      .select()

    if (insErr) throw insErr

    // Fire-and-forget: bump parent updated_at so the list reflows in the
    // picker. We don't await — clients only need the inserted items back.
    void supabase
      .from('campaign_worker_lists')
      .update({ updated_at: new Date().toISOString() })
      .eq('list_id', lid)
      .then(({ error }) => {
        if (error) console.error('Touch updated_at failed:', error)
      })

    const addedCount = inserted?.length ?? 0
    return NextResponse.json(
      {
        added: addedCount,
        skipped: ids.length - addedCount,
        items: inserted ?? [],
      },
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

    const body = await req.json().catch(() => null)
    const workerIds: unknown = body?.worker_ids
    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      return NextResponse.json({ error: 'worker_ids[] required' }, { status: 400 })
    }
    const ids = workerIds.filter((n): n is number => typeof n === 'number')

    // The DELETE is RLS-guarded against the parent list (campaign writer
    // policy), so we don't need a separate scope check. Skipping that read
    // saves one round-trip vs. the previous assertList() call.
    const { error } = await supabase
      .from('campaign_worker_list_items')
      .delete()
      .eq('list_id', lid)
      .in('worker_id', ids)

    if (error) throw error

    void supabase
      .from('campaign_worker_lists')
      .update({ updated_at: new Date().toISOString() })
      .eq('list_id', lid)
      .then(({ error: tErr }) => {
        if (tErr) console.error('Touch updated_at failed:', tErr)
      })

    return NextResponse.json({ ok: true, removed: ids.length })
  } catch (error) {
    console.error('DELETE worker-list items error:', error)
    return NextResponse.json({ error: 'Failed to remove items' }, { status: 500 })
  }
}
