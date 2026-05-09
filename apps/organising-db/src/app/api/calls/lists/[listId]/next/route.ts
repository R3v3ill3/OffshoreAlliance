import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichCallListItem, WORKER_SELECT } from '@/lib/phone/enrich-call-list-item'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const lid = parseInt(listId, 10)

    // Derive campaign_id from the list record (needed for enrichment).
    const { data: list } = await supabase
      .from('call_lists')
      .select('priority_strategy, campaign_id')
      .eq('list_id', lid)
      .single()

    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

    const campaignId = list.campaign_id

    const { data: callbacksDue } = await supabase
      .from('call_list_items')
      .select(WORKER_SELECT)
      .eq('list_id', lid)
      .eq('status', 'deferred')
      .lte('next_call_at', new Date().toISOString())
      .order('next_call_at', { ascending: true })
      .limit(1)

    if (callbacksDue && callbacksDue.length > 0) {
      return NextResponse.json(
        await enrichCallListItem(supabase, callbacksDue[0] as Record<string, unknown>, campaignId)
      )
    }

    let query = supabase
      .from('call_list_items')
      .select(WORKER_SELECT)
      .eq('list_id', lid)
      .eq('status', 'pending')
      .limit(1)

    switch (list.priority_strategy) {
      case 'priority_score':
        query = query.order('priority_score', { ascending: false })
        break
      case 'least_recently_contacted':
        query = query.order('last_attempt_at', { ascending: true, nullsFirst: true })
        break
      default:
        query = query.order('sort_order', { ascending: true })
    }

    const { data: items } = await query
    if (!items || items.length === 0) {
      return NextResponse.json({ done: true, message: 'No more contacts to call' })
    }

    return NextResponse.json(
      await enrichCallListItem(supabase, items[0] as Record<string, unknown>, campaignId)
    )
  } catch (error) {
    console.error('GET /api/calls/lists/[listId]/next error:', error)
    return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
  }
}
