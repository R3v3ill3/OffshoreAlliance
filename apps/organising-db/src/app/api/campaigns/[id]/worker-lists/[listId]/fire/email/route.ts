import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Fire a saved worker list into the email pathway.
 *
 * Server-side flow:
 *   1. Load the worker list and verify it has items.
 *   2. INSERT a `campaign_comms_drafts` shell with platform='email', status='draft'.
 *   3. Mark the worker list as fired (status, fired_draft_id, fired_at).
 *   4. Return a redirect_to URL into the email wizard with prefill params:
 *        ?campaign_id=X&draft_id=Y&prefill_source=worker_list&worker_list_id=Z
 *      The wizard's step 4 reads these params and pre-selects the worker-list
 *      members as recipients (filtered to those with email).
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

    const { count: itemCount, error: cntErr } = await supabase
      .from('campaign_worker_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', lid)
    if (cntErr) throw cntErr
    if (!itemCount || itemCount === 0) {
      return NextResponse.json(
        { error: 'List is empty — add workers before firing' },
        { status: 400 }
      )
    }

    const { data: draft, error: draftErr } = await supabase
      .from('campaign_comms_drafts')
      .insert({
        campaign_id: cid,
        platform: 'email',
        status: 'draft',
        subject: list.name,
        body: '',
        created_by: user.id,
      })
      .select('draft_id')
      .single()
    if (draftErr) throw draftErr

    const { error: markErr } = await supabase
      .from('campaign_worker_lists')
      .update({
        status: 'fired',
        fired_draft_id: draft.draft_id,
        fired_at: new Date().toISOString(),
      })
      .eq('list_id', lid)
    if (markErr) throw markErr

    const params2 = new URLSearchParams({
      campaign_id: String(cid),
      draft_id: String(draft.draft_id),
      prefill_source: 'worker_list',
      worker_list_id: String(lid),
    })

    return NextResponse.json({
      draft_id: draft.draft_id,
      redirect_to: `/campaigns/email-wizard?${params2.toString()}`,
    })
  } catch (error) {
    console.error('Fire email error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fire to email' },
      { status: 500 }
    )
  }
}
