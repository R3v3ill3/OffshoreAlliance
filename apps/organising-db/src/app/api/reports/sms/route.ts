/**
 * GET /api/reports/sms — org-wide SMS engagement report (Phase 12,
 * SMS_EXPANSION_BRIEF §F gap 2: "an entry in the /reports registry").
 *
 * The campaign-scoped panel under Outreach → SMS answers "how is this
 * campaign going". This answers "where is SMS being used at all",
 * which is the question the /reports surface exists for — so it reads
 * the same views unfiltered and joins campaign names.
 *
 * Served through a route rather than client-side view queries for the
 * same reason as /api/campaigns/[id]/sms-reporting: the browser client
 * is typed against generated Database types, which do not carry the
 * Phase 12 views until the next `pnpm gen:types`.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import type {
  VwSmsAssessmentReportRow,
  VwSmsCampaignRollupRow,
} from '@/types/sms'

export interface SmsOrgReportCampaignRow {
  campaign_id: number
  campaign_name: string
  rollup: VwSmsCampaignRollupRow
  assessments: VwSmsAssessmentReportRow[]
  assessments_total: number
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [
      { data: rollups, error: rollupErr },
      { data: assessments, error: assessmentsErr },
    ] = await Promise.all([
      supabase.from('vw_sms_campaign_rollup').select('*'),
      supabase.from('vw_sms_assessment_report').select('*'),
    ])
    if (rollupErr) throw rollupErr
    if (assessmentsErr) throw assessmentsErr

    const rollupRows = (rollups ?? []) as VwSmsCampaignRollupRow[]
    const assessmentRows = (assessments ?? []) as VwSmsAssessmentReportRow[]

    // A campaign can have assessments recorded over SMS without a
    // rollup row (ratings captured in a thread that never carried a
    // blast), so the campaign set is the union of both views — not the
    // rollup alone, which would hide exactly the chat-only campaigns
    // this report exists to surface.
    const campaignIds = [
      ...new Set([
        ...rollupRows.map((r) => r.campaign_id),
        ...assessmentRows.map((a) => a.campaign_id),
      ]),
    ].filter((id): id is number => id != null)

    if (campaignIds.length === 0) {
      return NextResponse.json({ campaigns: [] })
    }

    const { data: campaigns, error: campaignErr } = await supabase
      .from('campaigns')
      .select('campaign_id, name')
      .in('campaign_id', campaignIds)
    if (campaignErr) throw campaignErr

    const names = new Map<number, string>()
    for (const c of (campaigns ?? []) as Array<{
      campaign_id: number
      name: string | null
    }>) {
      names.set(c.campaign_id, c.name ?? `Campaign ${c.campaign_id}`)
    }

    const emptyRollup = (campaignId: number): VwSmsCampaignRollupRow => ({
      campaign_id: campaignId,
      blast_count: 0,
      sends_count: 0,
      delivered_count: 0,
      failed_count: 0,
      delivery_rate_pct: 0,
      conversation_count: 0,
      active_conversation_count: 0,
      inbound_reply_count: 0,
      conversations_with_reply: 0,
      reply_rate_pct: 0,
      opt_outs_count: 0,
      survey_count: 0,
      surveys_completed_count: 0,
    })

    const rows: SmsOrgReportCampaignRow[] = campaignIds
      // Campaigns the caller cannot see are filtered out by RLS on the
      // campaigns select, so drop any id that did not come back.
      .filter((id) => names.has(id))
      .map((id) => {
        const mine = assessmentRows.filter((a) => a.campaign_id === id)
        return {
          campaign_id: id,
          campaign_name: names.get(id)!,
          rollup: rollupRows.find((r) => r.campaign_id === id) ?? emptyRollup(id),
          assessments: mine,
          assessments_total: mine.reduce((sum, a) => sum + a.ratings_count, 0),
        }
      })
      .sort(
        (a, b) =>
          b.rollup.sends_count + b.assessments_total -
          (a.rollup.sends_count + a.assessments_total),
      )

    return NextResponse.json({ campaigns: rows })
  } catch (error) {
    console.error('GET reports/sms error:', error)
    return errorResponse('Failed to fetch SMS report', error)
  }
}
