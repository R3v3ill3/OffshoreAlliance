import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCampaignOrganiserId } from '@/lib/campaign/resolve-campaign-organiser'

/**
 * Fire a saved worker list into the activist-task pathway.
 *
 * The cohort maps onto a task list that has one leader (worker OR organiser)
 * and many follower workers. Resolution rules:
 *   - If the list has leader_worker_id set, that worker becomes the task
 *     leader. They are excluded from the followers list.
 *   - Otherwise if the request body provides leader_organiser_picker_value
 *     ("user:<uuid>" or numeric organiser_id), it is resolved to organiser_id
 *     via resolveCampaignOrganiserId.
 *   - If neither is set, the task list is created with no leader yet (the
 *     dialog will require one before activation).
 *
 * Response includes a fully-hydrated `draft` object matching the shape that
 * <CreateTaskListDialog draft={...} /> expects, so the panel can hand off
 * directly without an extra fetch.
 */
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

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const organiserPickerValue =
      typeof body?.leader_organiser_picker_value === 'string'
        ? (body.leader_organiser_picker_value as string)
        : null

    const { data: list, error: listErr } = await supabase
      .from('campaign_worker_lists')
      .select(
        'list_id, campaign_id, name, description, leader_worker_id, leader_organiser_id'
      )
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

    let leaderWorkerId: number | null = list.leader_worker_id
    let leaderOrganiserId: number | null = list.leader_organiser_id
    if (!leaderWorkerId && !leaderOrganiserId && organiserPickerValue) {
      // Resolve picker -> organiser_id (creates an organisers row if needed).
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      const isAdmin = profile?.role === 'admin'
      try {
        leaderOrganiserId = await resolveCampaignOrganiserId(
          supabase,
          organiserPickerValue,
          { currentUserId: user.id, isAdmin }
        )
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error ? err.message : 'Failed to resolve organiser',
          },
          { status: 400 }
        )
      }
    }

    const workerIdsForFollowers = items
      .map((it) => it.worker_id)
      .filter((wid) => wid !== leaderWorkerId)

    // Insert the task list shell as a draft (status='draft' — Activate-now happens in the dialog).
    const { data: taskList, error: tlErr } = await supabase
      .from('campaign_task_lists')
      .insert({
        campaign_id: cid,
        title: list.name,
        leader_worker_id: leaderWorkerId,
        leader_organiser_id: leaderOrganiserId,
        leader_instructions: list.description ?? null,
        status: 'draft',
      })
      .select('task_list_id')
      .single()
    if (tlErr) throw tlErr

    if (workerIdsForFollowers.length > 0) {
      const itemRows = workerIdsForFollowers.map((wid, i) => ({
        task_list_id: taskList.task_list_id,
        worker_id: wid,
        sort_order: i,
      }))
      const { error: insErr } = await supabase
        .from('campaign_task_list_items')
        .insert(itemRows)
      if (insErr) throw insErr
    }

    const { error: markErr } = await supabase
      .from('campaign_worker_lists')
      .update({
        status: 'fired',
        fired_task_list_id: taskList.task_list_id,
        fired_at: new Date().toISOString(),
      })
      .eq('list_id', lid)
    if (markErr) throw markErr

    // Build the draft payload in the exact shape <CreateTaskListDialog draft>
    // expects so the panel can hand off without a follow-up fetch.
    const draft = {
      task_list_id: taskList.task_list_id,
      title: list.name,
      activity_id: null,
      leader_worker_id: leaderWorkerId,
      leader_organiser_id: leaderOrganiserId,
      include_membership_ask: false,
      leader_instructions: list.description ?? null,
      worker_ids: workerIdsForFollowers,
    }

    return NextResponse.json({
      task_list_id: taskList.task_list_id,
      draft,
      // No redirect — the panel handles task drafts via callback.
      redirect_to: null,
    })
  } catch (error) {
    console.error('Fire task error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fire to task' },
      { status: 500 }
    )
  }
}
