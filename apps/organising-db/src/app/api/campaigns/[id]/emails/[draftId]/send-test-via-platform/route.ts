/**
 * POST /api/campaigns/[id]/emails/[draftId]/send-test-via-platform
 *
 * Send a single [TEST]-prefixed copy of the draft through the platform
 * email provider (SendGrid) — the exact pipeline the dispatch cron uses
 * (merge resolution with sample recipient data, sanitise, wrapper,
 * unsubscribe link) so what the organiser receives is what members will
 * get. Does not touch email_send_log or mark the draft sent.
 *
 * Body: { recipient_email: string, wrapper_id?: number | null }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getEmailProvider,
  getEmailSenderIdentity,
} from '@/lib/email/provider'
import {
  applyWrapper,
  unsubscribeUrlForToken,
  wrapperHasUnsubscribePlaceholder,
} from '@/lib/email/wrapper'
import {
  resolveScriptVariablesIncludingChips,
  SAMPLE_DATA,
} from '@/lib/comms/template-variables'
import { stripMergeFieldChips } from '@/lib/comms/chip-html'
import { sanitiseEmailHtml } from '@/lib/comms/sanitise-email-html'
import { htmlToPlain, isValidEmail } from '@/lib/comms/mailto-builder'
import { loadCampaignEmailContext } from '@/lib/comms/campaign-email-context'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, draftId: draftIdParam } = await ctx.params
  const campaignId = Number(id)
  const draftId = Number(draftIdParam)
  if (!Number.isFinite(campaignId) || !Number.isFinite(draftId)) {
    return NextResponse.json(
      { success: false, error: 'Bad route params' },
      { status: 400 },
    )
  }

  const body = (await req.json().catch(() => null)) as {
    recipient_email?: string
    wrapper_id?: number | null
  } | null
  const recipient = body?.recipient_email?.trim() ?? ''
  if (!isValidEmail(recipient)) {
    return NextResponse.json(
      { success: false, error: 'Valid recipient_email required' },
      { status: 400 },
    )
  }

  const { data: draft } = await supabase
    .from('campaign_comms_drafts')
    .select('draft_id, subject, body, body_html, wrapper_id')
    .eq('draft_id', draftId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!draft) {
    return NextResponse.json(
      { success: false, error: 'Draft not found or not accessible' },
      { status: 404 },
    )
  }
  const subjectTpl = ((draft.subject as string | null) ?? '').trim()
  const rawBody =
    ((draft.body_html as string | null)?.trim() ||
      (draft.body as string | null) ||
      '').trim()
  if (!rawBody) {
    return NextResponse.json(
      { success: false, error: 'Draft body is empty — write the email first.' },
      { status: 400 },
    )
  }

  // Wrapper: request override → draft's wrapper → default.
  const wrapperId = body?.wrapper_id ?? (draft.wrapper_id as number | null)
  const wrapperQuery = supabase
    .from('email_wrappers')
    .select('wrapper_id, name, header_html, footer_html, is_active')
  const { data: wrappers } = wrapperId
    ? await wrapperQuery.eq('wrapper_id', wrapperId)
    : await wrapperQuery.eq('is_default', true)
  const wrapper = (wrappers ?? [])[0]
  if (!wrapper || !wrapper.is_active || !wrapperHasUnsubscribePlaceholder(wrapper)) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No usable wrapper — configure a default wrapper with the {{unsubscribe_url}} placeholder at /email/wrappers.',
      },
      { status: 400 },
    )
  }

  // Merge context: real campaign values, sample recipient fields.
  const campaignContext = await loadCampaignEmailContext(
    supabase,
    campaignId,
    user.email ?? undefined,
  )
  const testCtx: Record<string, string | undefined> = {
    ...SAMPLE_DATA,
    ...Object.fromEntries(
      Object.entries(campaignContext).filter(([, v]) => v != null && v !== ''),
    ),
    first_name: SAMPLE_DATA.first_name,
    last_name: SAMPLE_DATA.last_name,
    occupation: SAMPLE_DATA.occupation,
  }

  const isHtmlSource = !!(draft.body_html as string | null)?.trim()
  const bodyTemplate = isHtmlSource
    ? sanitiseEmailHtml(stripMergeFieldChips(rawBody))
    : rawBody
  const subjectResolved = `[TEST] ${resolveScriptVariablesIncludingChips(
    subjectTpl || '(no subject)',
    testCtx,
  )}`
  const bodyResolved = resolveScriptVariablesIncludingChips(bodyTemplate, testCtx)
  const bodyHtml = isHtmlSource ? bodyResolved : textToHtml(bodyResolved)
  // Test unsubscribe link points at a non-token page (shows "link not
  // valid") — the organiser sees placement without being able to opt a
  // real worker out.
  const finalHtml = applyWrapper(bodyHtml, wrapper, {
    unsubscribeUrl: unsubscribeUrlForToken('test-preview'),
  })

  try {
    const [provider, sender] = await Promise.all([
      getEmailProvider(),
      getEmailSenderIdentity(),
    ])
    const results = await provider.sendBatch(
      [
        {
          to: recipient,
          subject: subjectResolved,
          html: finalHtml,
          text: htmlToPlain(finalHtml),
        },
      ],
      { from: sender },
    )
    const result = results[0]
    if (result?.status !== 'success') {
      return NextResponse.json(
        { success: false, error: result?.error ?? 'Provider send failed' },
        { status: 502 },
      )
    }
    return NextResponse.json({
      success: true,
      provider: provider.name,
      from: sender.fromEmail,
      wrapper: wrapper.name,
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Test send failed',
      },
      { status: 500 },
    )
  }
}
