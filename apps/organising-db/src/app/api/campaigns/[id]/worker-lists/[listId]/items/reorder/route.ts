import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    const { data: list, error: listErr } = await supabase
      .from('campaign_worker_lists')
      .select('list_id, campaign_id')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    const body = await req.json()
    const ordered: unknown = body?.ordered_worker_ids
    if (!Array.isArray(ordered) || ordered.length === 0) {
      return NextResponse.json({ error: 'ordered_worker_ids[] required' }, { status: 400 })
    }
    const ids = ordered.filter((n): n is number => typeof n === 'number')

    // Pairwise updates — fast enough for typical list sizes; avoids needing a
    // bulk RPC. Each row update goes through RLS individually.
    const errors: string[] = []
    await Promise.all(
      ids.map(async (workerId, sortOrder) => {
        const { error } = await supabase
          .from('campaign_worker_list_items')
          .update({ sort_order: sortOrder })
          .eq('list_id', lid)
          .eq('worker_id', workerId)
        if (error) errors.push(`worker_id ${workerId}: ${error.message}`)
      })
    )

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Some rows failed to reorder', details: errors }, { status: 207 })
    }

    return NextResponse.json({ ok: true, count: ids.length })
  } catch (error) {
    console.error('PATCH worker-list reorder error:', error)
    return NextResponse.json({ error: 'Failed to reorder items' }, { status: 500 })
  }
}
