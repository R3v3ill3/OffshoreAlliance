import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

/**
 * Fire a saved worker list into the email pathway.
 *
 * Server-side flow:
 *   1. Load the worker list + items (preserving sort_order).
 *   2. INSERT a `campaign_comms_drafts` shell (platform='email', status='draft',
 *      entry_branch='build_list').
 *   3. INSERT an `email_lists` row tagged with source = 'worker_list', then
 *      bulk INSERT `email_list_items` from the worker_list members (filtered to
 *      workers with email). sort_order preserved.
 *   4. UPDATE the draft so email_list_id points at the new list.
 *   5. Mark the worker list as fired (status, fired_draft_id, fired_email_list_id,
 *      fired_at).
 *   6. Return a redirect_to URL into the campaign-scoped email pathway picker
 *      (/campaigns/[id]/email/setup?draft_id=…) — *not* the legacy wizard.
 *      The pathway picker detects the attached list and skips the OrderPicker.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
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

    // Load worker_list items + workers.email so we can populate the
    // email_list with only those who have an email on file.
    const { data: items, error: itemsErr } = await supabase
      .from('campaign_worker_list_items')
      .select('worker_id, sort_order, workers!inner(email)')
      .eq('list_id', lid)
      .order('sort_order', { ascending: true })
    if (itemsErr) throw itemsErr
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'List is empty — add workers before firing' },
        { status: 400 },
      )
    }

    // campaign_comms_drafts.stage_number is NOT NULL with CHECK BETWEEN 1
    // AND 6. Mirror the prior fire-email behaviour: active stage or 1.
    const { data: stagePlans, error: stageErr } = await supabase
      .from('campaign_stage_plans')
      .select('stage_number, status')
      .eq('campaign_id', cid)
    if (stageErr) throw stageErr
    const activeStage = stagePlans?.find((s) => s.status === 'active')
    const stageNumber = activeStage?.stage_number ?? 1

    // Step 2: create the draft shell with entry_branch='build_list'.
    const { data: draft, error: draftErr } = await supabase
      .from('campaign_comms_drafts')
      .insert({
        campaign_id: cid,
        stage_number: stageNumber,
        platform: 'email',
        status: 'draft',
        title: list.name,
        subject: list.name,
        body: '',
        entry_branch: 'build_list',
        created_by: user.id,
      })
      .select('draft_id')
      .single()
    if (draftErr) throw draftErr

    // Step 3a: create email_list row.
    const { data: emailList, error: emailListErr } = await supabase
      .from('email_lists')
      .insert({
        campaign_id: cid,
        draft_id: draft.draft_id,
        name: list.name,
        description: list.description,
        status: 'draft',
        source_filters: { source: 'worker_list', list_id: lid },
        created_by: user.id,
      })
      .select('list_id')
      .single()
    if (emailListErr) throw emailListErr

    // Step 3b: populate email_list_items from worker_list members with email.
    interface WLI {
      worker_id: number
      sort_order: number
      workers:
        | { email: string | null }
        | { email: string | null }[]
        | null
    }
    const withEmail = (items as WLI[]).filter((it) => {
      const w = Array.isArray(it.workers) ? it.workers[0] : it.workers
      return !!w?.email && w.email.trim() !== ''
    })

    const emailItemRows = withEmail.map((it, i) => {
      const w = Array.isArray(it.workers) ? it.workers[0] : it.workers
      return {
        list_id: emailList.list_id,
        worker_id: it.worker_id,
        email: w?.email ?? null,
        sort_order: i,
        priority_score: i,
        status: 'pending' as const,
      }
    })

    if (emailItemRows.length > 0) {
      const { error: insErr } = await supabase
        .from('email_list_items')
        .insert(emailItemRows)
      if (insErr) throw insErr
    }

    const { error: totalErr } = await supabase
      .from('email_lists')
      .update({ total_items: emailItemRows.length })
      .eq('list_id', emailList.list_id)
    if (totalErr) throw totalErr

    // Step 4: link the draft to its email_list.
    const { error: linkErr } = await supabase
      .from('campaign_comms_drafts')
      .update({ email_list_id: emailList.list_id })
      .eq('draft_id', draft.draft_id)
    if (linkErr) throw linkErr

    // Step 5: mark the worker_list as fired.
    const { error: markErr } = await supabase
      .from('campaign_worker_lists')
      .update({
        status: 'fired',
        fired_draft_id: draft.draft_id,
        fired_email_list_id: emailList.list_id,
        fired_at: new Date().toISOString(),
      })
      .eq('list_id', lid)
    if (markErr) throw markErr

    // Step 6: route into the campaign-scoped email pathway picker, mirroring
    // the phone fire route's redirect into /phone/setup?action_id=…
    const redirectTo = `/campaigns/${cid}/email/setup?draft_id=${draft.draft_id}`

    return NextResponse.json({
      draft_id: draft.draft_id,
      email_list_id: emailList.list_id,
      total_items: emailItemRows.length,
      redirect_to: redirectTo,
    })
  } catch (error) {
    console.error('Fire email error:', error)
    return errorResponse('Failed to fire to email', error)
  }
}
