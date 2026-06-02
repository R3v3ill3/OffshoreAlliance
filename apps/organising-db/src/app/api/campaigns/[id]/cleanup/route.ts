/**
 * POST /api/campaigns/[id]/cleanup
 *
 * Dev / test cleanup endpoint. Removes phone call actions and/or email drafts
 * that were created during testing. Uses the service-role admin client to
 * bypass RLS (these tables have admin-only DELETE policies).
 *
 * Body: { scope: 'phone_actions' | 'email_drafts' | 'all' }
 *
 * The authenticated user is validated via the regular server client first;
 * the admin client is then used only for the actual deletions.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type CleanupScope = 'phone_actions' | 'email_drafts' | 'all'

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
    if (!['phone_actions', 'email_drafts', 'all'].includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    const admin = createAdminClient()
    const result: Record<string, number> = {}

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

    return NextResponse.json({ ok: true, deleted: result })
  } catch (error) {
    console.error('POST /cleanup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cleanup failed' },
      { status: 500 },
    )
  }
}
