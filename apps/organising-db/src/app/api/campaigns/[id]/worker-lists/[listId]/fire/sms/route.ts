import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

/** PostgREST caps responses at 1000 rows — page source reads. */
const PAGE_SIZE = 1000

/**
 * Fire a saved worker list into the SMS pathway (fourth sibling of
 * fire/email, fire/phone, fire/task).
 *
 * Server-side flow:
 *   1. Load the worker list + items (preserving sort_order) joined to
 *      workers(phone_e164, sms_opt_out).
 *   2. INSERT a campaign_comms_drafts shell (platform='sms',
 *      entry_branch='build_list').
 *   3. INSERT an sms_lists row tagged source='worker_list', then bulk
 *      INSERT sms_list_items:
 *        - workers.sms_opt_out = true  → status 'opted_out' (union-wide
 *          suppression applied at audience time; re-checked at send time)
 *        - phone_e164 IS NULL          → status 'skipped'
 *        - otherwise                    → status 'pending'
 *      total_items = pending count (sendable recipients).
 *   4. UPDATE the draft so sms_list_id points at the new list.
 *   5. Mark the worker list fired (status, fired_draft_id,
 *      fired_sms_list_id, fired_at).
 *   6. Return redirect_to the Outreach → SMS sub-tab with ?sms_list=
 *      so InlineSmsOpsPanel opens the composer on the new list.
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

    // Page: PostgREST caps at 1000 rows; large cohorts must not
    // silently truncate.
    interface WLI {
      worker_id: number
      sort_order: number
      workers:
        | { phone_e164: string | null; sms_opt_out: boolean }
        | { phone_e164: string | null; sms_opt_out: boolean }[]
        | null
    }
    const items: WLI[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error: itemsErr } = await supabase
        .from('campaign_worker_list_items')
        .select('worker_id, sort_order, workers!inner(phone_e164, sms_opt_out)')
        .eq('list_id', lid)
        .order('sort_order', { ascending: true })
        .order('worker_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (itemsErr) throw itemsErr
      items.push(...((page ?? []) as WLI[]))
      if (!page || page.length < PAGE_SIZE) break
    }
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'List is empty — add workers before firing' },
        { status: 400 },
      )
    }

    // campaign_comms_drafts.stage_number is NOT NULL with CHECK BETWEEN 1
    // AND 6. Mirror fire/email: active stage or 1.
    const { data: stagePlans, error: stageErr } = await supabase
      .from('campaign_stage_plans')
      .select('stage_number, status')
      .eq('campaign_id', cid)
    if (stageErr) throw stageErr
    const activeStage = stagePlans?.find((s) => s.status === 'active')
    const stageNumber = activeStage?.stage_number ?? 1

    // Step 2: draft shell.
    const { data: draft, error: draftErr } = await supabase
      .from('campaign_comms_drafts')
      .insert({
        campaign_id: cid,
        stage_number: stageNumber,
        platform: 'sms',
        status: 'draft',
        title: list.name,
        body: '',
        entry_branch: 'build_list',
        created_by: user.id,
      })
      .select('draft_id')
      .single()
    if (draftErr) throw draftErr

    // Step 3a: sms_lists row.
    const { data: smsList, error: smsListErr } = await supabase
      .from('sms_lists')
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
    if (smsListErr) throw smsListErr

    // Step 3b: populate items with consent + phone screening.
    const itemRows = items.map((it, i) => {
      const w = Array.isArray(it.workers) ? it.workers[0] : it.workers
      const optedOut = !!w?.sms_opt_out
      const phone = w?.phone_e164 ?? null
      return {
        list_id: smsList.list_id,
        worker_id: it.worker_id,
        phone_e164: phone,
        sort_order: i,
        status: optedOut ? 'opted_out' : phone ? 'pending' : 'skipped',
        failure_reason: optedOut
          ? 'Worker has opted out of SMS'
          : phone
            ? null
            : 'No mobile number on file',
      }
    })

    for (let i = 0; i < itemRows.length; i += 500) {
      const { error: insErr } = await supabase
        .from('sms_list_items')
        .insert(itemRows.slice(i, i + 500))
      if (insErr) throw insErr
    }

    const pendingCount = itemRows.filter((r) => r.status === 'pending').length
    const optedOutCount = itemRows.filter((r) => r.status === 'opted_out').length
    const skippedCount = itemRows.filter((r) => r.status === 'skipped').length

    const { error: totalErr } = await supabase
      .from('sms_lists')
      .update({ total_items: pendingCount })
      .eq('list_id', smsList.list_id)
    if (totalErr) throw totalErr

    // Step 4: link draft ↔ list.
    const { error: linkErr } = await supabase
      .from('campaign_comms_drafts')
      .update({ sms_list_id: smsList.list_id })
      .eq('draft_id', draft.draft_id)
    if (linkErr) throw linkErr

    // Step 5: mark the worker list fired.
    const { error: markErr } = await supabase
      .from('campaign_worker_lists')
      .update({
        status: 'fired',
        fired_draft_id: draft.draft_id,
        fired_sms_list_id: smsList.list_id,
        fired_at: new Date().toISOString(),
      })
      .eq('list_id', lid)
    if (markErr) throw markErr

    // Step 6: land on the SMS sub-tab with the composer open.
    const redirectTo = `/campaigns/${cid}?tab=outreach&sub=sms&sms_list=${smsList.list_id}`

    return NextResponse.json({
      draft_id: draft.draft_id,
      sms_list_id: smsList.list_id,
      total_items: pendingCount,
      opted_out: optedOutCount,
      skipped_no_phone: skippedCount,
      redirect_to: redirectTo,
    })
  } catch (error) {
    console.error('Fire sms error:', error)
    return errorResponse('Failed to fire to SMS', error)
  }
}
