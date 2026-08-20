/**
 * POST /api/campaigns/[id]/emails/[draftId]/queue-platform-send
 *
 * Queue a draft for on-platform (SendGrid) sending: creates an
 * email_lists row in 'queued' status with one item per recipient, ready
 * for /api/cron/dispatch-email-queue to drain. Nothing is sent here —
 * the cron does the merge-resolution, wrapper application and provider
 * calls (the SMS queue-action pattern).
 *
 * Queue-time screening (recorded, not silently dropped): missing email,
 * bounce-invalid address, email_opt_out. Opt-out is re-checked again at
 * send time by the dispatcher.
 *
 * Body: {
 *   worker_ids: number[],
 *   wrapper_id?: number | null,   // default wrapper when omitted
 *   scheduled_for?: string | null // ISO timestamp; null = next cron tick
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeSendBefore, DEFAULT_SMS_TIMEZONE } from '@/lib/sms/blackout'
import { wrapperHasUnsubscribePlaceholder } from '@/lib/email/wrapper'

const MAX_BATCH = 5000

interface BodyShape {
  worker_ids: number[]
  wrapper_id?: number | null
  scheduled_for?: string | null
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; draftId: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, draftId: draftIdParam } = await ctx.params
  const campaignId = Number(id)
  const draftId = Number(draftIdParam)
  if (!Number.isFinite(campaignId) || !Number.isFinite(draftId)) {
    return NextResponse.json(
      { success: false, error: 'Bad route params' },
      { status: 400 },
    )
  }

  const body = (await req.json().catch(() => null)) as BodyShape | null
  if (!body || !Array.isArray(body.worker_ids) || body.worker_ids.length === 0) {
    return NextResponse.json(
      { success: false, error: 'worker_ids required' },
      { status: 400 },
    )
  }
  if (body.worker_ids.length > MAX_BATCH) {
    return NextResponse.json(
      {
        success: false,
        error: `Batch too large (${body.worker_ids.length} > ${MAX_BATCH}).`,
      },
      { status: 400 },
    )
  }

  // 1. Draft must exist with an authored body.
  const { data: draft, error: draftErr } = await supabase
    .from('campaign_comms_drafts')
    .select('draft_id, campaign_id, subject, body, body_html')
    .eq('draft_id', draftId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (draftErr || !draft) {
    return NextResponse.json(
      { success: false, error: 'Draft not found or not accessible' },
      { status: 404 },
    )
  }
  const hasBody = !!(
    (draft.body_html && draft.body_html.trim()) ||
    (draft.body && draft.body.trim())
  )
  if (!hasBody) {
    return NextResponse.json(
      { success: false, error: 'Draft body is empty — write the email first.' },
      { status: 400 },
    )
  }

  // 2. Wrapper: explicit id or the default; must be active + compliant.
  const wrapperQuery = supabase
    .from('email_wrappers')
    .select('wrapper_id, name, header_html, footer_html, is_active')
  const { data: wrappers, error: wrapperErr } =
    body.wrapper_id != null
      ? await wrapperQuery.eq('wrapper_id', body.wrapper_id)
      : await wrapperQuery.eq('is_default', true)
  if (wrapperErr) {
    return NextResponse.json(
      { success: false, error: wrapperErr.message },
      { status: 500 },
    )
  }
  const wrapper = (wrappers ?? [])[0]
  if (!wrapper || !wrapper.is_active) {
    return NextResponse.json(
      {
        success: false,
        error:
          body.wrapper_id != null
            ? 'Selected wrapper not found or inactive.'
            : 'No default email wrapper configured — create one at /email/wrappers first.',
      },
      { status: 400 },
    )
  }
  if (!wrapperHasUnsubscribePlaceholder(wrapper)) {
    return NextResponse.json(
      {
        success: false,
        error: `Wrapper "${wrapper.name}" is missing the {{unsubscribe_url}} placeholder.`,
      },
      { status: 400 },
    )
  }

  // 3. Recipient screening (recorded on the list items).
  const { data: workers, error: workersErr } = await supabase
    .from('workers')
    .select('worker_id, email, email_status, email_opt_out')
    .in('worker_id', body.worker_ids)
  if (workersErr) {
    return NextResponse.json(
      { success: false, error: workersErr.message },
      { status: 500 },
    )
  }
  const workerById = new Map(
    (workers ?? []).map((w) => [w.worker_id as number, w]),
  )

  const scheduledFor =
    body.scheduled_for && !Number.isNaN(Date.parse(body.scheduled_for))
      ? new Date(body.scheduled_for)
      : null
  const queueAnchor = scheduledFor ?? new Date()
  const sendBefore = computeSendBefore(
    queueAnchor,
    DEFAULT_SMS_TIMEZONE,
    false,
  ).toISOString()

  interface ItemPlan {
    worker_id: number
    email: string | null
    status: 'queued' | 'skipped' | 'opted_out'
    detail: string | null
  }
  const plan: ItemPlan[] = [...new Set(body.worker_ids)].map((workerId) => {
    const w = workerById.get(workerId)
    if (!w) {
      return {
        worker_id: workerId,
        email: null,
        status: 'skipped',
        detail: 'Worker not found',
      }
    }
    if (w.email_opt_out) {
      return {
        worker_id: workerId,
        email: (w.email as string | null) ?? null,
        status: 'opted_out',
        detail: 'Worker has unsubscribed from email',
      }
    }
    if (!w.email || !(w.email as string).trim()) {
      return {
        worker_id: workerId,
        email: null,
        status: 'skipped',
        detail: 'No email address on file',
      }
    }
    if (w.email_status === 'invalid') {
      return {
        worker_id: workerId,
        email: w.email as string,
        status: 'skipped',
        detail: 'Email address previously bounced',
      }
    }
    return {
      worker_id: workerId,
      email: (w.email as string).trim(),
      status: 'queued',
      detail: null,
    }
  })

  const queuedCount = plan.filter((p) => p.status === 'queued').length
  if (queuedCount === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No sendable recipients — all selected workers are missing an email, bounced, or unsubscribed.',
      },
      { status: 400 },
    )
  }

  // 4. Create the list (RLS: can_write_to_campaign).
  const listName = `Platform send — ${
    (draft.subject as string | null)?.trim() || `draft #${draftId}`
  }`.slice(0, 300)
  const { data: list, error: listErr } = await supabase
    .from('email_lists')
    .insert({
      campaign_id: campaignId,
      draft_id: draftId,
      name: listName,
      status: 'queued',
      wrapper_id: wrapper.wrapper_id,
      timezone: DEFAULT_SMS_TIMEZONE,
      scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
      total_items: plan.length,
      created_by: user.id,
    })
    .select('list_id')
    .single()
  if (listErr || !list) {
    return NextResponse.json(
      { success: false, error: listErr?.message ?? 'List create failed' },
      { status: 500 },
    )
  }
  const listId = list.list_id as number

  // 5. Items (chunked inserts).
  const rows = plan.map((p, i) => ({
    list_id: listId,
    worker_id: p.worker_id,
    email: p.email,
    sort_order: i,
    status: p.status,
    send_status_detail: p.detail,
    send_before: p.status === 'queued' ? sendBefore : null,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error: itemErr } = await supabase
      .from('email_list_items')
      .insert(rows.slice(i, i + 500))
    if (itemErr) {
      // Roll the half-created list back so a retry starts clean.
      await supabase.from('email_lists').delete().eq('list_id', listId)
      return NextResponse.json(
        { success: false, error: itemErr.message },
        { status: 500 },
      )
    }
  }

  // 6. Link the draft to the queued list + wrapper.
  await supabase
    .from('campaign_comms_drafts')
    .update({ email_list_id: listId, wrapper_id: wrapper.wrapper_id })
    .eq('draft_id', draftId)

  return NextResponse.json({
    success: true,
    list_id: listId,
    queued: queuedCount,
    skipped: plan.filter((p) => p.status === 'skipped').length,
    opted_out: plan.filter((p) => p.status === 'opted_out').length,
    scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
    wrapper: { wrapper_id: wrapper.wrapper_id, name: wrapper.name },
  })
}
