/**
 * POST /api/campaigns/[id]/cleanup
 *
 * Dev / test cleanup endpoint. Removes phone call actions, email drafts,
 * assessments (campaign_activities), and task lists created during testing.
 * Uses the service-role admin client to bypass RLS.
 *
 * Body: { scope: 'phone_actions' | 'email_drafts' | 'assessments' | 'task_lists' | 'all' }
 *
 * The authenticated user is validated via the regular server client first.
 *
 * --- Upstream / downstream considerations ---
 *
 * assessments (campaign_activities where activity_kind = 'assessment'):
 *   - phone_call_actions.selected_assessment_ids is an integer[] with NO FK —
 *     must be manually cleared before (or after) deleting activities.
 *   - DB CASCADE handles: campaign_activity_ratings, activity_ambitions,
 *     activity_events, campaign_task_lists (+ items/tokens/form_events),
 *     call_attempt_assessment_ratings, woc_meeting_details, petition_signatures.
 *   - DB SET NULL handles: sms_interactions, email_cta_responses,
 *     call_script_cta_ambitions, call_attempt_cta_ratings, call_outcome_definitions.
 *
 * task_lists (campaign_task_lists):
 *   - campaign_worker_lists.fired_task_list_id is a plain integer with NO FK —
 *     must be manually nulled before deleting task lists.
 *   - DB CASCADE handles: campaign_task_list_items, campaign_leader_tokens,
 *     campaign_leader_form_events.
 *   - DB SET NULL handles: campaign_prospective_workers.task_list_id.
 *   - Ratings written by leaders (campaign_activity_ratings) remain on the
 *     linked activity and are NOT removed — only the list shell is deleted.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type CleanupScope = 'phone_actions' | 'email_drafts' | 'assessments' | 'task_lists' | 'all'

const VALID_SCOPES: CleanupScope[] = [
  'phone_actions',
  'email_drafts',
  'assessments',
  'task_lists',
  'all',
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const campaignId = parseInt(id, 10)
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    // Authenticate via user client first
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const scope: CleanupScope = body.scope ?? 'all'
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    const admin = createAdminClient()
    const result: Record<string, number> = {}

    // -----------------------------------------------------------------------
    // Phone actions
    // -----------------------------------------------------------------------
    if (scope === 'phone_actions' || scope === 'all') {
      // 1. Delete call_list_items → call_lists for this campaign
      const { data: callLists } = await admin
        .from('call_lists')
        .select('list_id')
        .eq('campaign_id', campaignId)

      if (callLists && callLists.length > 0) {
        const listIds = callLists.map((l) => l.list_id)

        // Delete call_step_outcomes and call_attempt_outcomes via call_attempts
        const { data: attempts } = await admin
          .from('call_attempts')
          .select('attempt_id')
          .in('list_id', listIds)

        if (attempts && attempts.length > 0) {
          const attemptIds = attempts.map((a) => a.attempt_id)
          await admin.from('call_step_outcomes').delete().in('attempt_id', attemptIds)
          await admin.from('call_attempt_outcomes').delete().in('attempt_id', attemptIds)
          await admin.from('call_attempts').delete().in('attempt_id', attemptIds)
        }

        await admin.from('call_list_items').delete().in('list_id', listIds)
        const { error: listDelErr } = await admin
          .from('call_lists')
          .delete()
          .in('list_id', listIds)
        if (listDelErr) throw listDelErr
        result.call_lists_deleted = listIds.length
      } else {
        result.call_lists_deleted = 0
      }

      // 2. Delete phone_call_actions for this campaign (created by current user)
      const { data: deleted, error: actionDelErr } = await admin
        .from('phone_call_actions')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('created_by', user.id)
        .select('action_id')
      if (actionDelErr) throw actionDelErr
      result.phone_actions_deleted = deleted?.length ?? 0
    }

    // -----------------------------------------------------------------------
    // Email drafts
    // -----------------------------------------------------------------------
    if (scope === 'email_drafts' || scope === 'all') {
      // 1. Delete email_list_items → email_lists for this campaign
      const { data: emailLists } = await admin
        .from('email_lists')
        .select('list_id')
        .eq('campaign_id', campaignId)

      if (emailLists && emailLists.length > 0) {
        const listIds = emailLists.map((l) => l.list_id)
        await admin.from('email_list_items').delete().in('list_id', listIds)
        const { error: elDelErr } = await admin
          .from('email_lists')
          .delete()
          .in('list_id', listIds)
        if (elDelErr) throw elDelErr
        result.email_lists_deleted = listIds.length
      } else {
        result.email_lists_deleted = 0
      }

      // 2. Delete campaign_comms_drafts for this campaign (created by current user)
      const { data: deletedDrafts, error: draftDelErr } = await admin
        .from('campaign_comms_drafts')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('created_by', user.id)
        .select('draft_id')
      if (draftDelErr) throw draftDelErr
      result.email_drafts_deleted = deletedDrafts?.length ?? 0
    }

    // -----------------------------------------------------------------------
    // Assessments (campaign_activities where activity_kind = 'assessment')
    //
    // Pre-step: clear the no-FK selected_assessment_ids array in
    // phone_call_actions so those rows don't hold phantom references.
    // Post-step: DB CASCADE removes ratings, ambitions, events, linked task
    // lists, call_attempt_assessment_ratings, woc_meeting_details, etc.
    // -----------------------------------------------------------------------
    if (scope === 'assessments' || scope === 'all') {
      const { data: activities } = await admin
        .from('campaign_activities')
        .select('activity_id')
        .eq('campaign_id', campaignId)
        .eq('activity_kind', 'assessment')

      if (activities && activities.length > 0) {
        const activityIds = activities.map((a) => a.activity_id)

        // Remove these IDs from phone_call_actions.selected_assessment_ids
        // (no FK — must be handled manually before deletion).
        // We read existing arrays and filter out the deleted IDs.
        const { data: phoneActions } = await admin
          .from('phone_call_actions')
          .select('action_id, selected_assessment_ids')
          .eq('campaign_id', campaignId)
          .not('selected_assessment_ids', 'is', null)

        if (phoneActions && phoneActions.length > 0) {
          for (const action of phoneActions) {
            const cleaned = (action.selected_assessment_ids as number[]).filter(
              (aid) => !activityIds.includes(aid),
            )
            if (cleaned.length !== (action.selected_assessment_ids as number[]).length) {
              await admin
                .from('phone_call_actions')
                .update({ selected_assessment_ids: cleaned })
                .eq('action_id', action.action_id)
            }
          }
        }

        // Deleting the activities triggers DB CASCADE on all child tables.
        const { error: actDelErr } = await admin
          .from('campaign_activities')
          .delete()
          .in('activity_id', activityIds)
        if (actDelErr) throw actDelErr
        result.assessments_deleted = activityIds.length
      } else {
        result.assessments_deleted = 0
      }
    }

    // -----------------------------------------------------------------------
    // Task lists (campaign_task_lists)
    //
    // Pre-step: null out campaign_worker_lists.fired_task_list_id (no FK).
    // Post-step: DB CASCADE removes list items, leader tokens, form events.
    // DB SET NULL handles campaign_prospective_workers.task_list_id.
    // Ratings written by leaders on activities remain — they belong to the
    // activity, not the list.
    // -----------------------------------------------------------------------
    if (scope === 'task_lists' || scope === 'all') {
      const { data: taskLists } = await admin
        .from('campaign_task_lists')
        .select('task_list_id')
        .eq('campaign_id', campaignId)

      if (taskLists && taskLists.length > 0) {
        const taskListIds = taskLists.map((t) => t.task_list_id)

        // Clear the no-FK fired_task_list_id reference in campaign_worker_lists.
        await admin
          .from('campaign_worker_lists')
          .update({ fired_task_list_id: null })
          .in('fired_task_list_id', taskListIds)

        const { error: tlDelErr } = await admin
          .from('campaign_task_lists')
          .delete()
          .in('task_list_id', taskListIds)
        if (tlDelErr) throw tlDelErr
        result.task_lists_deleted = taskListIds.length
      } else {
        result.task_lists_deleted = 0
      }
    }

    return NextResponse.json({ ok: true, deleted: result })
  } catch (error) {
    console.error('POST /cleanup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cleanup failed' },
      { status: 500 },
    )
  }
}
