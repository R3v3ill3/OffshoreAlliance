/**
 * @deprecated Use /api/calls/lists/[listId]/next instead (Phase C unified namespace).
 * Retained as a shim for one release window.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichCallListItem, WORKER_SELECT } from '@/lib/phone/enrich-call-list-item'

const CLAIM_TTL_SECONDS = 15 * 60

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const lid = parseInt(listId, 10)

    const { data: list, error: listErr } = await supabase
      .from('call_lists')
      .select('priority_strategy')
      .eq('list_id', lid)
      .single()

    if (listErr) {
      console.error('Phone Next (shim) list lookup error:', listErr)
      return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
    }
    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Reset expired in_progress items so they re-enter the pending queue.
    const expiredThreshold = new Date(Date.now() - CLAIM_TTL_SECONDS * 1000).toISOString()
    await supabase
      .from('call_list_items')
      .update({
        status: 'pending',
        claimed_at: null,
        claimed_by_session_label: null,
        claimed_by_worker_id: null,
      })
      .eq('list_id', lid)
      .eq('status', 'in_progress')
      .lt('claimed_at', expiredThreshold)

    const { data: callbacksDue, error: callbackErr } = await supabase
      .from('call_list_items')
      .select(WORKER_SELECT)
      .eq('list_id', lid)
      .eq('status', 'deferred')
      .lte('next_call_at', new Date().toISOString())
      .order('next_call_at', { ascending: true })
      .limit(1)

    if (callbackErr) {
      console.error('Phone Next (shim) callbacks error:', callbackErr)
      return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
    }

    if (callbacksDue && callbacksDue.length > 0) {
      return NextResponse.json(
        await enrichCallListItem(supabase, callbacksDue[0] as Record<string, unknown>, parseInt(campaignId))
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

    const { data: items, error: itemsErr } = await query

    if (itemsErr) {
      console.error('Phone Next (shim) items error:', itemsErr)
      return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ done: true, message: 'No more contacts to call' })
    }

    return NextResponse.json(
      await enrichCallListItem(supabase, items[0] as Record<string, unknown>, parseInt(campaignId))
    )
  } catch (error) {
    console.error('Phone Next (shim) error:', error)
    return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
  }
}
