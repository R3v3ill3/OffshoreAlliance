/**
 * POST /api/campaigns/[id]/sms-lists/[listId]/worker-list — "create
 * list from responders" for a blast (Phase 7, brief §3.1 item 11).
 *
 * Body: { cohort: 'replied' | 'delivered_not_replied' | 'failed',
 *         name?: string }
 *
 * Creates a DRAFT campaign_worker_list (+items) from the chosen blast
 * cohort — the same saved-cohort shape the wall chart builds, so it is
 * immediately fireable into phone / email / task / SMS. "Replied" uses
 * the worker's conversation last_inbound_at at/after the item's
 * sent_at (blasts don't carry per-message thread links).
 *
 * Auth + rate limit + can_write_to_campaign (the insert is also
 * RLS-gated, this just surfaces a clean 403). Cohort maths is pure —
 * lib/sms/reporting-cohorts.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import {
  BLAST_COHORT_LABELS,
  computeBlastCohortWorkerIds,
  type BlastCohort,
  type BlastCohortItem,
} from '@/lib/sms/reporting-cohorts'

/** PostgREST caps responses at 1000 rows — page reads, chunk writes. */
const PAGE_SIZE = 1000
const CHUNK_SIZE = 500

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

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    const body = (await req.json()) as { cohort?: string; name?: string }
    const cohort = body.cohort as BlastCohort
    if (!cohort || !(cohort in BLAST_COHORT_LABELS)) {
      return NextResponse.json(
        { error: "cohort must be one of 'replied', 'delivered_not_replied', 'failed'" },
        { status: 400 },
      )
    }

    const { data: canWrite, error: permErr } = await supabase.rpc(
      'can_write_to_campaign',
      { p_campaign_id: cid },
    )
    if (permErr) throw permErr
    if (!canWrite) {
      return NextResponse.json(
        { error: 'No write access to this campaign' },
        { status: 403 },
      )
    }

    const { data: list, error: listErr } = await supabase
      .from('sms_lists')
      .select('list_id, campaign_id, name, status')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }
    if (list.status === 'draft') {
      return NextResponse.json(
        { error: 'This blast has not been sent yet — there are no responders to segment.' },
        { status: 409 },
      )
    }

    // Items (paged past the PostgREST cap).
    const items: BlastCohortItem[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sms_list_items')
        .select('worker_id, status, sent_at')
        .eq('list_id', lid)
        .order('item_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      items.push(...((data ?? []) as BlastCohortItem[]))
      if (!data || data.length < PAGE_SIZE) break
    }

    // Reply signal: max last_inbound_at across the worker's threads.
    const lastInboundByWorker = new Map<number, string>()
    if (cohort !== 'failed') {
      const workerIds = [...new Set(items.map((i) => i.worker_id))]
      for (let i = 0; i < workerIds.length; i += CHUNK_SIZE) {
        const { data, error } = await supabase
          .from('sms_conversations')
          .select('worker_id, last_inbound_at')
          .in('worker_id', workerIds.slice(i, i + CHUNK_SIZE))
          .not('last_inbound_at', 'is', null)
        if (error) throw error
        for (const c of (data ?? []) as Array<{
          worker_id: number
          last_inbound_at: string
        }>) {
          const prev = lastInboundByWorker.get(c.worker_id)
          if (!prev || c.last_inbound_at > prev) {
            lastInboundByWorker.set(c.worker_id, c.last_inbound_at)
          }
        }
      }
    }

    const workerIds = computeBlastCohortWorkerIds(items, lastInboundByWorker, cohort)
    if (workerIds.length === 0) {
      return NextResponse.json(
        { error: `No workers in the "${BLAST_COHORT_LABELS[cohort]}" cohort yet.` },
        { status: 409 },
      )
    }

    const name =
      body.name?.trim() || `${list.name} — ${BLAST_COHORT_LABELS[cohort]}`
    const { data: workerList, error: createErr } = await supabase
      .from('campaign_worker_lists')
      .insert({
        campaign_id: cid,
        name: name.slice(0, 300),
        description: `Created from SMS blast "${list.name}" (${BLAST_COHORT_LABELS[cohort]} cohort).`,
        default_purpose: null,
        status: 'draft',
        source: 'sms_blast_cohort',
        created_by: user.id,
      })
      .select('list_id, name')
      .single()
    if (createErr) throw createErr

    for (let i = 0; i < workerIds.length; i += CHUNK_SIZE) {
      const { error } = await supabase.from('campaign_worker_list_items').insert(
        workerIds.slice(i, i + CHUNK_SIZE).map((workerId, j) => ({
          list_id: workerList.list_id,
          worker_id: workerId,
          sort_order: i + j,
        })),
      )
      if (error) throw error
    }

    return NextResponse.json(
      {
        list_id: workerList.list_id,
        name: workerList.name,
        items: workerIds.length,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST sms-lists/[listId]/worker-list error:', error)
    return errorResponse('Failed to create worker list from blast cohort', error)
  }
}
