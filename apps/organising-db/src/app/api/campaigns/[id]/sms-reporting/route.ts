/**
 * GET /api/campaigns/[id]/sms-reporting — Phase 7 reporting payload
 * for the SMS Outreach overview: the campaign rollup row
 * (vw_sms_campaign_rollup) plus per-sender stats
 * (vw_sms_sender_stats) with display names resolved.
 *
 * Served through a route (not client-side view queries) because the
 * browser Supabase client is typed against the generated Database
 * types, which do not carry the two new views until the next
 * `pnpm gen:types` after apply.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import type { VwSmsCampaignRollupRow, VwSmsSenderStatsRow } from '@/types/sms'

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

    const [{ data: rollup, error: rollupErr }, { data: senders, error: sendersErr }] =
      await Promise.all([
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
      ])
    if (rollupErr) throw rollupErr
    if (sendersErr) throw sendersErr

    const senderRows = (senders ?? []) as VwSmsSenderStatsRow[]
    const names: Record<string, string> = {}
    const senderIds = [...new Set(senderRows.map((s) => s.sender_user_id))]
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
    })
  } catch (error) {
    console.error('GET sms-reporting error:', error)
    return errorResponse('Failed to fetch SMS reporting', error)
  }
}
