/**
 * POST /api/campaigns/[id]/emails/[draftId]/save-to-outlook
 *
 * Creates drafts in the connected user's Outlook mailbox via Microsoft
 * Graph. Two modes:
 *
 *   - 'personalised'  — one draft per recipient with {{first_name}}
 *                       resolved per-worker. The killer unlock vs.
 *                       mailto/eml: every recipient gets a personalised
 *                       email, drafts queued in /Drafts for review.
 *
 *   - 'bcc'           — single shared draft with the recipient list in
 *                       BCC. Recipient tokens are stripped / replaced
 *                       with collective phrasing because the same body
 *                       goes to everyone. Matches the original ask
 *                       ("one Outlook draft with BCC populated") but
 *                       uses OAuth so it sidesteps the New Outlook /
 *                       .eml regression.
 *
 * Body:
 *   {
 *     mode: 'personalised' | 'bcc',
 *     worker_ids: number[],
 *     // Optional: replacement for recipient tokens in BCC mode.
 *     collective_phrasing?: {
 *       first_name?: string  // default: 'comrades'
 *       last_name?: string   // default: ''
 *       occupation?: string  // default: 'workmate'
 *     }
 *   }
 *
 * Response:
 *   { success, drafts_created, drafts_failed, errors, batch_id }
 *
 * Each Graph createDraft call is ~1–2s; for large batches we cap at
 * MAX_BATCH and ask the caller to chunk further. We do NOT update
 * campaign_comms_drafts.status — Outlook drafts are "saved", not
 * "sent". email_list_items.status is also untouched (the user still
 * sends from their client).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMicrosoftAccessToken,
  touchLastUsed,
} from '@/lib/integrations/microsoft-connection'
import {
  createDraft,
  type GraphRecipient,
} from '@/lib/integrations/microsoft-graph'
import {
  resolveScriptVariables,
  resolveTemplateVariables,
} from '@/lib/comms/template-variables'

const MAX_BATCH = 200

interface BodyShape {
  mode: 'personalised' | 'bcc'
  worker_ids: number[]
  collective_phrasing?: {
    first_name?: string
    last_name?: string
    occupation?: string
  }
}

interface WorkerRow {
  worker_id: number
  first_name: string | null
  last_name: string | null
  email: string | null
  occupation: string | null
  employer_name: string | null
  worksite_name: string | null
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

  const body = (await req.json()) as BodyShape
  if (!body?.mode || !['personalised', 'bcc'].includes(body.mode)) {
    return NextResponse.json(
      { success: false, error: 'mode must be "personalised" or "bcc"' },
      { status: 400 },
    )
  }
  if (!Array.isArray(body.worker_ids) || body.worker_ids.length === 0) {
    return NextResponse.json(
      { success: false, error: 'worker_ids required' },
      { status: 400 },
    )
  }
  if (body.worker_ids.length > MAX_BATCH) {
    return NextResponse.json(
      {
        success: false,
        error: `Batch too large (${body.worker_ids.length} > ${MAX_BATCH}). Send in chunks.`,
      },
      { status: 400 },
    )
  }

  // 1. Load the draft (verify ownership via campaign membership).
  const { data: draft, error: draftErr } = await supabase
    .from('campaign_comms_drafts')
    .select('draft_id, campaign_id, subject, preheader, body, body_html')
    .eq('draft_id', draftId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (draftErr || !draft) {
    return NextResponse.json(
      { success: false, error: 'Draft not found or not accessible' },
      { status: 404 },
    )
  }

  // 2. Load recipients.
  const { data: workersRaw, error: workersErr } = await supabase
    .from('workers')
    .select(
      'worker_id, first_name, last_name, email, occupation, employers(employer_name), worksites(worksite_name)',
    )
    .in('worker_id', body.worker_ids)
  if (workersErr) {
    return NextResponse.json(
      { success: false, error: workersErr.message },
      { status: 500 },
    )
  }
  const workers: WorkerRow[] = (workersRaw ?? [])
    .map((row: Record<string, unknown>) => {
      const emp = row.employers as
        | { employer_name: string }
        | { employer_name: string }[]
        | null
      const ws = row.worksites as
        | { worksite_name: string }
        | { worksite_name: string }[]
        | null
      return {
        worker_id: row.worker_id as number,
        first_name: (row.first_name as string | null) ?? null,
        last_name: (row.last_name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        occupation: (row.occupation as string | null) ?? null,
        employer_name: Array.isArray(emp)
          ? emp[0]?.employer_name ?? null
          : emp?.employer_name ?? null,
        worksite_name: Array.isArray(ws)
          ? ws[0]?.worksite_name ?? null
          : ws?.worksite_name ?? null,
      }
    })
    .filter((w) => !!w.email && w.email.trim() !== '')

  if (workers.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No recipients with valid email addresses.' },
      { status: 400 },
    )
  }

  // 3. Campaign context for variable resolution.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('campaign_id, name, organiser_id')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  const { data: timeline } = await supabase
    .from('campaign_timelines')
    .select('agreement_id')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  let employerName = ''
  let agreementName = ''
  if (timeline?.agreement_id) {
    const { data: agreement } = await supabase
      .from('agreements')
      .select('agreement_name, employer_id')
      .eq('agreement_id', timeline.agreement_id)
      .maybeSingle()
    agreementName = agreement?.agreement_name ?? ''
    if (agreement?.employer_id) {
      const { data: employer } = await supabase
        .from('employers')
        .select('employer_name')
        .eq('employer_id', agreement.employer_id)
        .maybeSingle()
      employerName = employer?.employer_name ?? ''
    }
  }
  let organiserName = ''
  let organiserPhone = ''
  if (campaign?.organiser_id) {
    const { data: org } = await supabase
      .from('organisers')
      .select('organiser_name, phone')
      .eq('organiser_id', campaign.organiser_id)
      .maybeSingle()
    organiserName = org?.organiser_name ?? ''
    organiserPhone = org?.phone ?? ''
  }

  const campaignContext: Record<string, string | undefined> = {
    employer_name: employerName || undefined,
    agreement_name: agreementName || undefined,
    campaign_name: campaign?.name ?? undefined,
    organiser_name: organiserName || undefined,
    organiser_phone: organiserPhone || undefined,
    staff_email: user.email ?? undefined,
    date: new Date().toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  }

  // 4. Acquire a Microsoft access token (refresh if needed).
  let tokenResult
  try {
    tokenResult = await getMicrosoftAccessToken(user.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, error: message, needs_connection: true },
      { status: 400 },
    )
  }

  const subjectTpl = draft.subject ?? ''
  const bodySource = (draft.body_html && draft.body_html.trim()) || draft.body || ''
  const isHtmlSource = !!(draft.body_html && draft.body_html.trim())

  const errors: Array<{ worker_id?: number; email?: string; error: string }> = []
  let draftsCreated = 0

  if (body.mode === 'personalised') {
    // One draft per recipient.
    for (const worker of workers) {
      try {
        const ctx = {
          ...campaignContext,
          first_name: worker.first_name ?? '',
          last_name: worker.last_name ?? '',
          occupation: worker.occupation ?? '',
        }
        const subjectResolved = resolveScriptVariables(subjectTpl, ctx)
        const bodyResolved = isHtmlSource
          ? resolveScriptVariables(bodySource, ctx)
          : textToHtml(resolveScriptVariables(bodySource, ctx))
        await createDraft(tokenResult.accessToken, {
          subject: subjectResolved,
          bodyHtml: bodyResolved,
          toRecipients: [
            {
              emailAddress: {
                address: worker.email!,
                name:
                  [worker.first_name, worker.last_name]
                    .filter(Boolean)
                    .join(' ') || undefined,
              },
            },
          ],
        })
        draftsCreated += 1
      } catch (err) {
        errors.push({
          worker_id: worker.worker_id,
          email: worker.email ?? undefined,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } else {
    // Shared BCC draft. Recipient tokens become collective phrasing.
    const collectiveCtx: Record<string, string | undefined> = {
      ...campaignContext,
      first_name: body.collective_phrasing?.first_name ?? 'comrades',
      last_name: body.collective_phrasing?.last_name ?? '',
      occupation: body.collective_phrasing?.occupation ?? 'workmate',
    }
    try {
      const subjectResolved = resolveScriptVariables(subjectTpl, collectiveCtx)
      const bodyResolvedBase = resolveTemplateVariables(bodySource, campaignContext)
      const bodyResolved = resolveScriptVariables(bodyResolvedBase, collectiveCtx)
      const bodyHtml = isHtmlSource ? bodyResolved : textToHtml(bodyResolved)
      const bccList: GraphRecipient[] = workers.map((w) => ({
        emailAddress: {
          address: w.email!,
          name:
            [w.first_name, w.last_name].filter(Boolean).join(' ') || undefined,
        },
      }))
      await createDraft(tokenResult.accessToken, {
        subject: subjectResolved,
        bodyHtml: bodyHtml,
        bccRecipients: bccList,
      })
      draftsCreated = 1
    } catch (err) {
      errors.push({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 5. Record the batch + touch last_used_at.
  const admin = createAdminClient()
  const { data: batchRow } = await admin
    .from('oauth_send_batches')
    .insert({
      user_id: user.id,
      connection_id: tokenResult.connection.connection_id,
      draft_id: draftId,
      mode: body.mode,
      recipient_count: workers.length,
      drafts_created: draftsCreated,
      drafts_failed: errors.length,
      errors: errors.length > 0 ? errors : null,
    })
    .select('batch_id')
    .maybeSingle()
  await touchLastUsed(user.id)

  return NextResponse.json({
    success: errors.length === 0 || draftsCreated > 0,
    drafts_created: draftsCreated,
    drafts_failed: errors.length,
    errors,
    batch_id: batchRow?.batch_id ?? null,
    mailbox: tokenResult.connection.email,
  })
}

function textToHtml(text: string): string {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
