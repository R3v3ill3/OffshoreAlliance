/**
 * GET /api/campaigns/[id]/emails/[draftId]/platform-stats
 *
 * Progress + engagement readout for a platform (SendGrid) send:
 * per-item queue progress from vw_email_campaign_summary and
 * engagement aggregates (delivered / opened / clicked / bounced /
 * unsubscribed) from email_send_log — populated by the Event Webhook.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
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
    return NextResponse.json({ error: 'Bad route params' }, { status: 400 })
  }

  const { data: draft } = await supabase
    .from('campaign_comms_drafts')
    .select('draft_id, email_list_id, sent_via, status')
    .eq('draft_id', draftId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  let list: Record<string, unknown> | null = null
  if (draft.email_list_id) {
    const { data } = await supabase
      .from('vw_email_campaign_summary')
      .select('*')
      .eq('list_id', draft.email_list_id)
      .maybeSingle()
    list = data ?? null
  }

  const countSends = async (
    filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>,
  ): Promise<number> => {
    const { count } = await filter(base())
    return count ?? 0
  }
  const base = () =>
    supabase
      .from('email_send_log')
      .select('send_id', { count: 'exact', head: true })
      .eq('draft_id', draftId)
      .eq('send_method', 'sendgrid')

  const [total, delivered, opened, clicked, bounced, unsubscribed, replied] =
    await Promise.all([
      countSends((q) => q),
      countSends((q) => q.not('delivered_at', 'is', null)),
      countSends((q) => q.not('first_open_at', 'is', null)),
      countSends((q) => q.not('first_click_at', 'is', null)),
      countSends((q) => q.not('bounced_at', 'is', null)),
      countSends((q) => q.not('unsubscribed_at', 'is', null)),
      countSends((q) => q.not('replied_at', 'is', null)),
    ])

  return NextResponse.json({
    draft_status: draft.status,
    sent_via: draft.sent_via,
    list,
    engagement: { total, delivered, opened, clicked, bounced, unsubscribed, replied },
  })
}
