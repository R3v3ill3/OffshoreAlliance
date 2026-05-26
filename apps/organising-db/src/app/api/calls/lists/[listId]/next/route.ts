import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichCallListItem, WORKER_SELECT } from '@/lib/phone/enrich-call-list-item'

/**
 * Authenticated staff "next contact" endpoint.
 *
 * Uses the same `claim_next_call_list_item` RPC the share-link dialer uses,
 * tagging the claim with a staff session label so that:
 *
 *  - two staff users sharing the same call list never see the same contact,
 *  - claims are visible in the coordinator dashboard alongside share-token
 *    claims (W5),
 *  - stale staff claims are auto-released via the RPC's TTL just like
 *    share-link claims.
 *
 * Falls back to a deferred-callback peek before claiming a regular pending
 * item, so callers who scheduled a callback see it the moment it's due.
 */
const CLAIM_TTL_SECONDS = 15 * 60

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
    if (!Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid list id' }, { status: 400 })
    }

    const { data: list, error: listErr } = await supabase
      .from('call_lists')
      .select('priority_strategy, campaign_id')
      .eq('list_id', lid)
      .single()

    if (listErr) {
      console.error('GET /api/calls/lists/[listId]/next list lookup error:', listErr)
      return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
    }
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

    const campaignId = list.campaign_id
    const sessionLabel = `staff:${user.id}`

    // Resolve the staff caller's worker id (used to attribute attempts and
    // to surface their own claims in coordinator dashboards).
    const { data: callerWorker } = await supabase
      .from('workers')
      .select('worker_id')
      .eq('id', user.id)
      .maybeSingle()
    const sessionWorkerId = (callerWorker?.worker_id as number | null | undefined) ?? null

    const { data: claimedItemId, error: claimErr } = await supabase.rpc(
      'claim_next_call_list_item',
      {
        p_list_id: lid,
        p_session_label: sessionLabel,
        p_session_worker_id: sessionWorkerId,
        p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
      },
    )

    if (claimErr) {
      console.error('GET /api/calls/lists/[listId]/next claim rpc error:', claimErr)
      return NextResponse.json({ error: 'Failed to claim next contact' }, { status: 500 })
    }

    if (!claimedItemId) {
      return NextResponse.json({ done: true, message: 'No more contacts to call' })
    }

    const { data: item, error: itemErr } = await supabase
      .from('call_list_items')
      .select(WORKER_SELECT)
      .eq('item_id', claimedItemId)
      .single()

    if (itemErr || !item) {
      console.error('GET /api/calls/lists/[listId]/next item fetch error:', itemErr)
      return NextResponse.json({ error: 'Failed to load claimed contact' }, { status: 500 })
    }

    return NextResponse.json(
      await enrichCallListItem(supabase, item as Record<string, unknown>, campaignId),
    )
  } catch (error) {
    console.error('GET /api/calls/lists/[listId]/next error:', error)
    return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
  }
}
