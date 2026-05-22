import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

/**
 * Fire a saved worker list into the phone pathway.
 *
 * Server-side flow:
 *   1. Load the worker list and its items (sorted by sort_order).
 *   2. INSERT a `call_lists` row tagged with source_filters.source = 'worker_list'.
 *   3. Bulk INSERT `call_list_items` from the worker list items, using sort_order
 *      as the priority_score so the order in the build-list panel is preserved.
 *   4. Mark the worker list as fired (status = 'fired', fired_call_list_id, fired_at).
 *   5. Return a redirect_to URL pointing at the existing list-management screen,
 *      where the user attaches a script and starts calling.
 */
export async function POST(
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

    const { data: list, error: listErr } = await supabase
      .from('campaign_worker_lists')
      .select('list_id, campaign_id, name, description')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    const { data: items, error: itemsErr } = await supabase
      .from('campaign_worker_list_items')
      .select('worker_id, sort_order')
      .eq('list_id', lid)
      .order('sort_order', { ascending: true })
    if (itemsErr) throw itemsErr
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'List is empty — add workers before firing' },
        { status: 400 }
      )
    }

    const { data: callList, error: callListErr } = await supabase
      .from('call_lists')
      .insert({
        campaign_id: cid,
        name: list.name,
        description: list.description,
        priority_strategy: 'sequential',
        source_filters: { source: 'worker_list', list_id: lid },
        status: 'draft',
        created_by: user.id,
      })
      .select('list_id')
      .single()
    if (callListErr) throw callListErr

    const callItemRows = items.map((it, i) => ({
      list_id: callList.list_id,
      worker_id: it.worker_id,
      sort_order: i,
      priority_score: i,
      status: 'pending' as const,
    }))

    const { error: insErr } = await supabase
      .from('call_list_items')
      .insert(callItemRows)
    if (insErr) throw insErr

    const { error: markErr } = await supabase
      .from('campaign_worker_lists')
      .update({
        status: 'fired',
        fired_call_list_id: callList.list_id,
        fired_at: new Date().toISOString(),
      })
      .eq('list_id', lid)
    if (markErr) throw markErr

    // Create a phone_call_actions session row so this pathway has the same
    // resume + reporting + setup affordances as the orchestrator-driven
    // pathways. entry_branch='build_list' marks the origin so analytics can
    // distinguish wall-chart fires from explicit Create Phone Call sessions.
    const { data: action, error: actionErr } = await supabase
      .from('phone_call_actions')
      .insert({
        campaign_id: cid,
        created_by: user.id,
        entry_branch: 'build_list',
        list_ids: [callList.list_id],
        status: 'in_progress',
      })
      .select('action_id')
      .single()
    if (actionErr) {
      // Don't fail the fire if action creation hits a constraint — the
      // worker list still gets a call_lists row, so the user can dial.
      // Log so the issue surfaces in server logs.
      console.error('phone_call_actions insert failed (non-fatal):', actionErr)
    }

    // Route the user into the same orchestrator UI as the "Create Phone
    // Call" pathway, but with the list already attached. /phone/setup
    // detects the action_id, lets the user pick Script vs Assessment-only,
    // then skips the OrderPicker (order is implicitly list_first since
    // the list is already done) and lands them on the right setup
    // component (script wizard or assessment-setup). The legacy
    // /phone/lists/[listId] page is still reachable via the dialler's
    // "Attach script" affordance.
    const redirectTo = action?.action_id
      ? `/campaigns/${cid}/phone/setup?action_id=${action.action_id}`
      : `/campaigns/${cid}/phone/lists/${callList.list_id}`
    return NextResponse.json({
      call_list_id: callList.list_id,
      action_id: action?.action_id ?? null,
      redirect_to: redirectTo,
    })
  } catch (error) {
    console.error('Fire phone error:', error)
    return errorResponse('Failed to fire to phone', error)
  }
}
