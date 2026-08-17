/**
 * GET /api/campaigns/[id]/sms-reporting — reporting payload for the
 * SMS Outreach overview.
 *
 * Phase 7: the campaign rollup row (vw_sms_campaign_rollup) plus
 * per-sender stats (vw_sms_sender_stats) with display names resolved.
 *
 * Phase 12 (§F): per-chat-session throughput
 * (vw_sms_chat_session_report) and the assessment split
 * (vw_sms_assessment_report). Added here rather than under a new
 * /sms/report route — the brief's suggested path — because the panel
 * renders all four together and a second round trip buys nothing.
 *
 * Served through a route (not client-side view queries) because the
 * browser Supabase client is typed against the generated Database
 * types, which do not carry the new views until the next
 * `pnpm gen:types` after apply.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import type {
  VwSmsAssessmentReportRow,
  VwSmsCampaignRollupRow,
  VwSmsChatSessionReportRow,
  VwSmsSenderStatsRow,
} from '@/types/sms'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const cid = parseInt(id, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [
      { data: rollup, error: rollupErr },
      { data: senders, error: sendersErr },
      { data: chats, error: chatsErr },
      { data: assessments, error: assessmentsErr },
    ] = await Promise.all([
      supabase
        .from('vw_sms_campaign_rollup')
        .select('*')
        .eq('campaign_id', cid)
        .maybeSingle(),
      supabase
        .from('vw_sms_sender_stats')
        .select('*')
        .eq('campaign_id', cid)
        .order('replies_sent', { ascending: false }),
      supabase
        .from('vw_sms_chat_session_report')
        .select('*')
        .eq('campaign_id', cid)
        .order('created_at', { ascending: false }),
      supabase
        .from('vw_sms_assessment_report')
        .select('*')
        .eq('campaign_id', cid)
        .order('ratings_count', { ascending: false }),
    ])
    if (rollupErr) throw rollupErr
    if (sendersErr) throw sendersErr
    if (chatsErr) throw chatsErr
    if (assessmentsErr) throw assessmentsErr

    const senderRows = (senders ?? []) as VwSmsSenderStatsRow[]
    const chatRows = (chats ?? []) as VwSmsChatSessionReportRow[]
    const names: Record<string, string> = {}
    // Chat sessions resolve names from the same lookup: §F asks for
    // per-organiser throughput, and the session's creator is who ran it.
    const senderIds = [
      ...new Set([
        ...senderRows.map((s) => s.sender_user_id),
        ...chatRows
          .map((c) => c.created_by)
          .filter((v): v is string => v != null),
      ]),
    ]
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', senderIds)
      for (const p of (profiles ?? []) as Array<{
        user_id: string
        display_name: string | null
      }>) {
        if (p.display_name) names[p.user_id] = p.display_name
      }
    }

    return NextResponse.json({
      rollup: (rollup ?? null) as VwSmsCampaignRollupRow | null,
      senders: senderRows.map((s) => ({
        ...s,
        sender_name: names[s.sender_user_id] ?? 'Unknown staff',
      })),
      chat_sessions: chatRows.map((c) => ({
        ...c,
        created_by_name:
          (c.created_by ? names[c.created_by] : null) ?? 'Unknown staff',
      })),
      assessments: (assessments ?? []) as VwSmsAssessmentReportRow[],
    })
  } catch (error) {
    console.error('GET sms-reporting error:', error)
    return errorResponse('Failed to fetch SMS reporting', error)
  }
}
