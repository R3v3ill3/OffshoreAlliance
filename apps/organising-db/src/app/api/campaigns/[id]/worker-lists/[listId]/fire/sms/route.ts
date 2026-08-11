import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { normalisePhoneE164OrNull, smsReadiness } from '@/lib/sms/build-list-readiness'

/** PostgREST caps responses at 1000 rows — page source reads. */
const PAGE_SIZE = 1000

/**
 * Fire a saved worker list into the SMS pathway (fourth sibling of
 * fire/email, fire/phone, fire/task). Two-mode (Phase 8, brief §B
 * decision, chain B):
 *
 *   - No `pathway` in the body ("prepare" mode): validate the list,
 *     compute readiness counts and return the picker URL. No writes
 *     at all — abandoning the picker leaves no artifacts.
 *   - `pathway: 'blast'`: today's route body verbatim — INSERT a
 *     campaign_comms_drafts shell, an sms_lists row, screened
 *     sms_list_items, link the draft to the list, and mark the
 *     worker list fired (status, fired_sms_list_id, fired_at — no
 *     longer fired_draft_id, which is now email-exclusive). Guarded
 *     by a per-channel already-fired check (decision 4).
 *   - `pathway: 'chat' | 'survey'`: 400 — Chat has no server write
 *     yet (defence in depth behind the disabled picker card) and
 *     Survey is client-side navigation only, so a POST here is a
 *     client bug.
 */
export async function POST(
  req: NextRequest,
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

    // Body is optional — the build-list fire mutation sends no body
    // for non-task pathways, and prepare mode has nothing to send.
    const body = (await req.json().catch(() => ({}))) as {
      pathway?: 'blast' | 'chat' | 'survey'
      force?: boolean
    }
    const pathway = body?.pathway
    const force = body?.force === true

    const { data: list, error: listErr } = await supabase
      .from('campaign_worker_lists')
      .select('list_id, campaign_id, name, description, status, fired_sms_list_id')
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

    const readinessItems = items.map((it) => {
      const w = Array.isArray(it.workers) ? it.workers[0] : it.workers
      return { phone_e164: w?.phone_e164 ?? null, sms_opt_out: w?.sms_opt_out ?? false }
    })

    // ── Prepare mode: no writes, just the readiness picture. ──────
    if (!pathway) {
      const readiness = smsReadiness(readinessItems)
      return NextResponse.json({
        redirect_to: `/campaigns/${cid}/sms/setup?worker_list_id=${lid}`,
        worker_list_id: lid,
        total: readiness.total,
        sendable: readiness.sendable,
        opted_out: readiness.optedOut,
        missing_mobile: readiness.missingMobile,
      })
    }

    if (pathway === 'chat') {
      return NextResponse.json(
        { error: 'The SMS chat workspace is coming in a later release' },
        { status: 400 },
      )
    }

    if (pathway === 'survey') {
      return NextResponse.json(
        { error: 'The Survey pathway is a client-side navigation — nothing to POST here' },
        { status: 400 },
      )
    }

    // pathway === 'blast'

    // Per-channel already-fired guard (decision 4): a cohort may be
    // fired to SMS once without confirmation; a second fire requires
    // an explicit { force: true } override.
    if (list.fired_sms_list_id != null && !force) {
      return NextResponse.json(
        {
          error: 'This cohort has already been fired to SMS',
          already_fired: { channel: 'sms', sms_list_id: list.fired_sms_list_id },
        },
        { status: 409 },
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
      // Whitespace-only phone_e164 must screen as missing, matching
      // smsReadiness — a `" "` value must never reach 'pending'.
      const phone = normalisePhoneE164OrNull(w?.phone_e164)
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

    // Step 5: mark the worker list fired. fired_draft_id is no longer
    // written here (decision 4) — it is now email-exclusive.
    const { error: markErr } = await supabase
      .from('campaign_worker_lists')
      .update({
        status: 'fired',
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
