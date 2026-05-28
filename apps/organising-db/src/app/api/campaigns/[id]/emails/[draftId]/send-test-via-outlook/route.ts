/**
 * POST /api/campaigns/[id]/emails/[draftId]/send-test-via-outlook
 *
 * Send a single test email via Microsoft Graph /me/sendMail. Uses sample
 * data for recipient merge fields so the organiser sees a realistic preview.
 * Does not mark the draft as sent or write to email_send_log.
 *
 * Body: { recipient_email: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getMicrosoftAccessToken,
  touchLastUsed,
} from '@/lib/integrations/microsoft-connection'
import {
  sendMessage,
  hasSendScope,
} from '@/lib/integrations/microsoft-graph'
import {
  resolveScriptVariablesIncludingChips,
  SAMPLE_DATA,
} from '@/lib/comms/template-variables'
import { stripMergeFieldChips } from '@/lib/comms/chip-html'
import { sanitiseEmailHtml } from '@/lib/comms/sanitise-email-html'
import { appendOASignature } from '@/lib/comms/oa-email-signature'
import { loadCampaignEmailContext } from '@/lib/comms/campaign-email-context'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface BodyShape {
  recipient_email?: string
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
  const recipientEmail = body.recipient_email?.trim() ?? ''
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return NextResponse.json(
      { success: false, error: 'A valid recipient_email is required' },
      { status: 400 },
    )
  }

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

  const campaignContext = await loadCampaignEmailContext(
    supabase,
    campaignId,
    user.email ?? undefined,
  )
  const previewCtx: Record<string, string | undefined> = {
    ...campaignContext,
    ...SAMPLE_DATA,
  }

  const subjectTpl = draft.subject ?? ''
  const rawBody =
    (draft.body_html && draft.body_html.trim()) || draft.body || ''
  const isHtmlSource = !!(draft.body_html && draft.body_html.trim())
  const bodySource = isHtmlSource
    ? sanitiseEmailHtml(stripMergeFieldChips(rawBody))
    : rawBody

  const subjectResolved = `[TEST] ${resolveScriptVariablesIncludingChips(
    subjectTpl,
    previewCtx,
  )}`
  const bodyResolvedBase = isHtmlSource
    ? resolveScriptVariablesIncludingChips(bodySource, previewCtx)
    : textToHtml(resolveScriptVariablesIncludingChips(bodySource, previewCtx))
  const finalBodyHtml = appendOASignature(bodyResolvedBase)

  try {
    await sendMessage(tokenResult.accessToken, {
      subject: subjectResolved,
      bodyHtml: finalBodyHtml,
      toRecipients: [
        {
          emailAddress: {
            address: recipientEmail,
          },
        },
      ],
      saveToSentItems: true,
    })
    await touchLastUsed(user.id)
    return NextResponse.json({
      success: true,
      mailbox: tokenResult.connection.email,
      recipient_email: recipientEmail,
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
