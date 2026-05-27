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
  resolveScriptVariablesIncludingChips,
  resolveTemplateVariables,
} from '@/lib/comms/template-variables'
import { stripMergeFieldChips } from '@/lib/comms/chip-html'
import { sanitiseEmailHtml } from '@/lib/comms/sanitise-email-html'
import {
  loadCampaignEmailContext,
  buildWorkerEmailContext,
} from '@/lib/comms/campaign-email-context'
import { recordEmailSend, tagWorkerEmailed } from '@/lib/comms/send-log'
import { rewriteLinks } from '@/lib/comms/click-tracker'

const MAX_BATCH = 200
const DEBUG = process.env.DEBUG_EMAIL_RESOLVE === '1'

function dbg(label: string, payload: unknown): void {
  if (!DEBUG) return
  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload)
    console.log(`[save-to-outlook] ${label}: ${str.slice(0, 800)}`)
  } catch {
    // Best-effort logging only.
  }
}

interface BodyShape {
  mode: 'personalised' | 'bcc'
  worker_ids: number[]
  collective_phrasing?: {
    first_name?: string
    last_name?: string
    occupation?: string
  }
  /**
   * Optional overrides — when present, server skips template-variable
   * resolution for these fields and uses the provided strings as-is.
   * Used by the BCC pre-send dialog after the user has chosen how to
   * handle varying / missing tokens.
   */
  subject_override?: string
  body_html_override?: string
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

  // 3. Campaign context — shared loader matches the client's varContext
  // build (employer_name, worksite_name, agreement_name, etc.) including
  // member-derived fallbacks when there's no formal agreement on file.
  const campaignContext = await loadCampaignEmailContext(
    supabase,
    campaignId,
    user.email ?? undefined,
  )

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

  const subjectTpl = body.subject_override ?? draft.subject ?? ''
  const rawBody =
    body.body_html_override ??
    ((draft.body_html && draft.body_html.trim()) || draft.body || '')
  const isHtmlSource =
    !!body.body_html_override ||
    !!(draft.body_html && draft.body_html.trim())

  // Defensive: strip any merge-field chip wrappers that may have escaped
  // the client-side sanitise step (e.g. legacy drafts, programmatic
  // setContent paths that bypassed onChange). Keeps raw `{{key}}` tokens
  // intact for the resolver downstream. Then run a general HTML scrub
  // to drop Outlook / Gmail paste cruft (data-outlook-id, style, etc.)
  // before resolution + send.
  const bodySource = isHtmlSource
    ? sanitiseEmailHtml(stripMergeFieldChips(rawBody))
    : rawBody
  dbg('input subject', subjectTpl)
  dbg('input body (first 800)', bodySource)

  const errors: Array<{ worker_id?: number; email?: string; error: string }> = []
  let draftsCreated = 0
  // When DEBUG mode is on, capture diagnostic info to return on the
  // response so the user can inspect it in DevTools → Network without
  // hunting Vercel function logs.
  const debugInfo: Record<string, unknown> = DEBUG
    ? {
        campaign_context: campaignContext,
        input_subject: subjectTpl,
        input_body_preview: bodySource.slice(0, 400),
        body_was_html: isHtmlSource,
        body_chip_spans_seen: /<span[^>]*data-merge-field=/i.test(rawBody),
      }
    : {}

  if (body.mode === 'personalised') {
    // One draft per recipient.
    for (const worker of workers) {
      try {
        const ctx = buildWorkerEmailContext(campaignContext, worker)
        const subjectResolved = body.subject_override
          ? subjectTpl
          : resolveScriptVariablesIncludingChips(subjectTpl, ctx)
        const bodyResolved = body.body_html_override
          ? rawBody
          : isHtmlSource
          ? resolveScriptVariablesIncludingChips(bodySource, ctx)
          : textToHtml(resolveScriptVariablesIncludingChips(bodySource, ctx))
        if (worker === workers[0]) {
          dbg('first-recipient ctx', ctx)
          dbg('first-recipient resolved subject', subjectResolved)
          dbg('first-recipient resolved body (first 800)', bodyResolved)
          if (DEBUG) {
            debugInfo.first_recipient_ctx = ctx
            debugInfo.first_recipient_resolved_subject = subjectResolved
            debugInfo.first_recipient_resolved_body_preview =
              bodyResolved.slice(0, 400)
          }
        }

        // Record the send first so we have a sendId for click-token rewriting.
        const sendId = await recordEmailSend({
          draftId,
          campaignId,
          workerId: worker.worker_id,
          recipientEmail: worker.email!,
          sendMethod: 'outlook_personalised',
          conversationId: null, // updated below once Graph responds
          externalMessageId: null,
          userId: user.id,
        })

        // Rewrite outbound links for click-tracking (only if sendId was obtained).
        let finalBodyHtml = bodyResolved
        if (sendId) {
          const rewritten = await rewriteLinks(bodyResolved, sendId).catch(() => null)
          if (rewritten) finalBodyHtml = rewritten.html
        }

        const graphMsg = await createDraft(tokenResult.accessToken, {
          subject: subjectResolved,
          bodyHtml: finalBodyHtml,
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

        // Back-fill the Graph IDs onto the send log row, then tag the worker.
        if (sendId) {
          const admin = createAdminClient()
          void admin
            .from('email_send_log')
            .update({
              conversation_id: graphMsg.conversationId ?? null,
              external_message_id: graphMsg.id,
            })
            .eq('send_id', sendId)
            .then(() => tagWorkerEmailed(worker.worker_id))
        }
      } catch (err) {
        errors.push({
          worker_id: worker.worker_id,
          email: worker.email ?? undefined,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } else {
    // Shared BCC draft. If body/subject overrides were passed (from the
    // BccPreSendDialog), use them verbatim — the dialog already applied
    // the user's chosen substitutions. Otherwise fall back to the legacy
    // collective-phrasing behaviour so callers that don't open the
    // dialog still get a usable draft.
    const collectiveCtx: Record<string, string | undefined> = {
      ...campaignContext,
      first_name: body.collective_phrasing?.first_name ?? 'comrades',
      last_name: body.collective_phrasing?.last_name ?? '',
      occupation: body.collective_phrasing?.occupation ?? 'workmate',
    }
    try {
      const subjectResolved = body.subject_override
        ? subjectTpl
        : resolveScriptVariablesIncludingChips(subjectTpl, collectiveCtx)
      let bodyHtmlBase: string
      if (body.body_html_override) {
        bodyHtmlBase = rawBody
      } else {
        const baseResolved = resolveTemplateVariables(bodySource, campaignContext)
        const bodyResolved = resolveScriptVariablesIncludingChips(
          baseResolved,
          collectiveCtx,
        )
        bodyHtmlBase = isHtmlSource ? bodyResolved : textToHtml(bodyResolved)
      }
      dbg('bcc resolved subject', subjectResolved)
      dbg('bcc resolved body (first 800)', bodyHtmlBase)
      if (DEBUG) {
        debugInfo.bcc_resolved_subject = subjectResolved
        debugInfo.bcc_resolved_body_preview = bodyHtmlBase.slice(0, 400)
      }
      const bccList: GraphRecipient[] = workers.map((w) => ({
        emailAddress: {
          address: w.email!,
          name:
            [w.first_name, w.last_name].filter(Boolean).join(' ') || undefined,
        },
      }))

      // For BCC mode, record send for the first worker to get a sendId for
      // click token generation (tokens will be shared across all recipients).
      const firstWorker = workers[0]
      const firstSendId = firstWorker
        ? await recordEmailSend({
            draftId,
            campaignId,
            workerId: firstWorker.worker_id,
            recipientEmail: firstWorker.email!,
            sendMethod: 'outlook_bcc',
            conversationId: null,
            externalMessageId: null,
            userId: user.id,
          })
        : null

      // Rewrite links using the first sendId (tokens shared across BCC list).
      let finalBodyHtml = bodyHtmlBase
      if (firstSendId) {
        const rewritten = await rewriteLinks(bodyHtmlBase, firstSendId).catch(() => null)
        if (rewritten) finalBodyHtml = rewritten.html
      }

      const graphMsg = await createDraft(tokenResult.accessToken, {
        subject: subjectResolved,
        bodyHtml: finalBodyHtml,
        bccRecipients: bccList,
      })
      draftsCreated = 1

      const admin = createAdminClient()
      // Record one send-log entry per BCC recipient with the shared conversationId.
      // First worker's row was already created above; update it and create rest.
      for (let i = 0; i < workers.length; i++) {
        const worker = workers[i]
        if (i === 0 && firstSendId) {
          void admin
            .from('email_send_log')
            .update({
              conversation_id: graphMsg.conversationId ?? null,
              external_message_id: graphMsg.id,
            })
            .eq('send_id', firstSendId)
            .then(() => tagWorkerEmailed(worker.worker_id))
        } else {
          void recordEmailSend({
            draftId,
            campaignId,
            workerId: worker.worker_id,
            recipientEmail: worker.email!,
            sendMethod: 'outlook_bcc',
            conversationId: graphMsg.conversationId ?? null,
            externalMessageId: graphMsg.id,
            userId: user.id,
          }).then(() => tagWorkerEmailed(worker.worker_id))
        }
      }
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
    ...(DEBUG ? { debug: debugInfo } : {}),
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
