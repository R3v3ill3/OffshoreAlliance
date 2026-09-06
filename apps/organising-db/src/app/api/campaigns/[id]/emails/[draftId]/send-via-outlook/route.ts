/**
 * POST /api/campaigns/[id]/emails/[draftId]/send-via-outlook
 *
 * Send mail directly via Microsoft Graph's /me/sendMail endpoint — the
 * "send now" power-user path that bypasses the Drafts folder entirely.
 * Requires the `Mail.Send` scope on the user's connection (existing
 * organisers connected before Mail.Send was added must reconnect with
 * `?reconsent=1` to grant it).
 *
 * Mirrors `save-to-outlook/route.ts` in structure but:
 *   - Creates then immediately sends a draft so Graph returns the message and
 *     conversation ids required for reply reconciliation.
 *   - send_method on email_send_log is `outlook_send_*` (vs `outlook_*`).
 *   - oauth_send_batches.mode is the same string ('personalised' | 'bcc'),
 *     so callers / dashboards can join across both routes.
 *   - This action IS reversible only in the sense that the user can
 *     follow up — no draft step. Confirmation guarding lives in the UI.
 *
 * Body shape (identical to save-to-outlook plus an implicit Mail.Send
 * scope check):
 *   {
 *     mode: 'personalised' | 'bcc',
 *     worker_ids: number[],
 *     collective_phrasing?: { first_name?, last_name?, occupation? },
 *     subject_override?: string,
 *     body_html_override?: string,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMicrosoftAccessToken,
  touchLastUsed,
} from '@/lib/integrations/microsoft-connection'
import {
  createAndSendMessage,
  hasSendScope,
  type GraphRecipient,
} from '@/lib/integrations/microsoft-graph'
import {
  resolveScriptVariablesIncludingChips,
  resolveTemplateVariables,
} from '@/lib/comms/template-variables'
import { stripMergeFieldChips } from '@/lib/comms/chip-html'
import { sanitiseEmailHtml } from '@/lib/comms/sanitise-email-html'
import { appendOASignature } from '@/lib/comms/oa-email-signature'
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
    console.log(`[send-via-outlook] ${label}: ${str.slice(0, 800)}`)
  } catch {
    // best-effort
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
  subject_override?: string
  body_html_override?: string
}

interface WorkerRow {
  worker_id: number
  first_name: string | null
  last_name: string | null
  email: string | null
  email_status: string | null
  email_opt_out: boolean
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
  const { data: canWrite, error: permissionError } = await supabase.rpc(
    'can_write_to_campaign',
    { p_campaign_id: campaignId },
  )
  if (permissionError) {
    return NextResponse.json(
      { success: false, error: 'Could not verify campaign permissions' },
      { status: 500 },
    )
  }
  if (!canWrite) {
    return NextResponse.json(
      { success: false, error: 'You do not have permission to send for this campaign' },
      { status: 403 },
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

  // 1. Load draft.
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

  // 2. Recipients (filter out invalid email addresses and bounce-flagged workers).
  const { data: workersRaw, error: workersErr } = await supabase
    .from('workers')
    .select(
      'worker_id, first_name, last_name, email, email_status, email_opt_out, occupation, employers(employer_name), worksites(worksite_name)',
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
        email_status: (row.email_status as string | null) ?? null,
        email_opt_out: Boolean(row.email_opt_out),
        occupation: (row.occupation as string | null) ?? null,
        employer_name: Array.isArray(emp)
          ? emp[0]?.employer_name ?? null
          : emp?.employer_name ?? null,
        worksite_name: Array.isArray(ws)
          ? ws[0]?.worksite_name ?? null
          : ws?.worksite_name ?? null,
      } as WorkerRow
    })
    .filter(
      (w) =>
        !!w.email &&
        w.email.trim() !== '' &&
        w.email_status !== 'invalid' &&
        !w.email_opt_out,
    )

  if (workers.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No eligible recipients (invalid addresses and workers who opted out are excluded).',
      },
      { status: 400 },
    )
  }

  // 3. Campaign context — shared loader matches client + save-to-outlook.
  const campaignContext = await loadCampaignEmailContext(
    supabase,
    campaignId,
    user.email ?? undefined,
  )

  // 4. Acquire access token + verify Mail.Send scope.
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
  if (!hasSendScope(tokenResult.connection.scopes)) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Outlook connection does not include Mail.Send permission. Reconnect to grant direct-send access.',
        needs_reconsent: true,
      },
      { status: 403 },
    )
  }

  const subjectTpl = body.subject_override ?? draft.subject ?? ''
  const rawBody =
    body.body_html_override ??
    ((draft.body_html && draft.body_html.trim()) || draft.body || '')
  const isHtmlSource =
    !!body.body_html_override ||
    !!(draft.body_html && draft.body_html.trim())
  const bodySource = isHtmlSource
    ? sanitiseEmailHtml(stripMergeFieldChips(rawBody))
    : rawBody
  dbg('input subject', subjectTpl)
  dbg('input body (first 800)', bodySource)

  const errors: Array<{ worker_id?: number; email?: string; error: string }> = []
  let sentCount = 0
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
    for (const worker of workers) {
      try {
        const ctx = buildWorkerEmailContext(campaignContext, worker)
        if (worker === workers[0]) {
          dbg('first-recipient ctx', ctx)
          if (DEBUG) debugInfo.first_recipient_ctx = ctx
        }
        const subjectResolved = body.subject_override
          ? subjectTpl
          : resolveScriptVariablesIncludingChips(subjectTpl, ctx)
        const bodyResolvedBase = body.body_html_override
          ? rawBody
          : isHtmlSource
          ? resolveScriptVariablesIncludingChips(bodySource, ctx)
          : textToHtml(resolveScriptVariablesIncludingChips(bodySource, ctx))

        // Log the send pre-Graph so we have a sendId for click tracking.
        const sendId = await recordEmailSend({
          draftId,
          campaignId,
          workerId: worker.worker_id,
          recipientEmail: worker.email!,
          sendMethod: 'outlook_send_personalised',
          conversationId: null,
          externalMessageId: null,
          userId: user.id,
        })
        if (sendId == null) {
          throw new Error('Could not create the email send audit row')
        }

        let finalBodyHtml = bodyResolvedBase
        const rewritten = await rewriteLinks(bodyResolvedBase, sendId).catch(
          () => null,
        )
        if (rewritten) finalBodyHtml = rewritten.html
        finalBodyHtml = appendOASignature(finalBodyHtml)

        const graphMessage = await createAndSendMessage(tokenResult.accessToken, {
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
        const admin = createAdminClient()
        const { error: sendLogUpdateError } = await admin
          .from('email_send_log')
          .update({
            conversation_id: graphMessage.conversationId ?? null,
            external_message_id: graphMessage.id,
          })
          .eq('send_id', sendId)
        if (sendLogUpdateError) throw sendLogUpdateError
        sentCount += 1
        await tagWorkerEmailed(worker.worker_id).catch((tagError) => {
          console.error('[send-via-outlook] failed to tag worker as emailed:', tagError)
        })
      } catch (err) {
        errors.push({
          worker_id: worker.worker_id,
          email: worker.email ?? undefined,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } else {
    // BCC fan-out (single shared body).
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

      const bccList: GraphRecipient[] = workers.map((w) => ({
        emailAddress: {
          address: w.email!,
          name:
            [w.first_name, w.last_name].filter(Boolean).join(' ') || undefined,
        },
      }))

      // Record send-log entry for the first worker first so we can
      // rewrite links against a real sendId; remaining recipients reuse
      // the shared body but each gets their own send_log row.
      const firstWorker = workers[0]
      const firstSendId = firstWorker
        ? await recordEmailSend({
            draftId,
            campaignId,
            workerId: firstWorker.worker_id,
            recipientEmail: firstWorker.email!,
            sendMethod: 'outlook_send_bcc',
            conversationId: null,
            externalMessageId: null,
            userId: user.id,
          })
        : null
      if (firstWorker && firstSendId == null) {
        throw new Error('Could not create the first BCC send audit row')
      }

      let finalBodyHtml = bodyHtmlBase
      if (firstSendId != null) {
        const rewritten = await rewriteLinks(bodyHtmlBase, firstSendId).catch(
          () => null,
        )
        if (rewritten) finalBodyHtml = rewritten.html
      }
      finalBodyHtml = appendOASignature(finalBodyHtml)

      const graphMessage = await createAndSendMessage(tokenResult.accessToken, {
        subject: subjectResolved,
        bodyHtml: finalBodyHtml,
        bccRecipients: bccList,
      })
      sentCount = workers.length

      if (firstSendId != null) {
        const admin = createAdminClient()
        await admin
          .from('email_send_log')
          .update({
            conversation_id: graphMessage.conversationId ?? null,
            external_message_id: graphMessage.id,
          })
          .eq('send_id', firstSendId)
      }

      // Persist every recipient before returning so reconciliation and audit
      // rows cannot be lost when the serverless invocation is suspended.
      await Promise.all(
        workers.slice(1).map(async (worker) => {
          const sendId = await recordEmailSend({
            draftId,
            campaignId,
            workerId: worker.worker_id,
            recipientEmail: worker.email!,
            sendMethod: 'outlook_send_bcc',
            conversationId: graphMessage.conversationId ?? null,
            externalMessageId: graphMessage.id,
            userId: user.id,
          })
          if (sendId == null) {
            throw new Error(
              `Could not create the send audit row for worker ${worker.worker_id}`,
            )
          }
          await tagWorkerEmailed(worker.worker_id).catch((tagError) => {
            console.error('[send-via-outlook] failed to tag worker as emailed:', tagError)
          })
        }),
      )
      if (firstWorker) {
        await tagWorkerEmailed(firstWorker.worker_id).catch((tagError) => {
          console.error('[send-via-outlook] failed to tag worker as emailed:', tagError)
        })
      }
    } catch (err) {
      errors.push({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 5. Audit batch row + touch.
  const admin = createAdminClient()
  const { data: batchRow } = await admin
    .from('oauth_send_batches')
    .insert({
      user_id: user.id,
      connection_id: tokenResult.connection.connection_id,
      draft_id: draftId,
      mode: body.mode,
      recipient_count: workers.length,
      drafts_created: sentCount, // re-using column for "sends" — semantics differ
      drafts_failed: errors.length,
      errors: errors.length > 0 ? errors : null,
    })
    .select('batch_id')
    .maybeSingle()
  await touchLastUsed(user.id)

  // Mark the draft as sent (the parent draft is no longer editable as
  // "pending" once direct-sent — mirrors AN's create-message behaviour).
  if (sentCount > 0) {
    await admin
      .from('campaign_comms_drafts')
      .update({
        status: 'sent',
        sent_via: 'outlook_direct',
      })
      .eq('draft_id', draftId)
  }

  return NextResponse.json({
    success: errors.length === 0 || sentCount > 0,
    sent_count: sentCount,
    failed_count: errors.length,
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
