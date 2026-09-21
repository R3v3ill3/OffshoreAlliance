import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadCampaignParent } from '@/lib/campaign/campaign-parent'
import { familyActivityFilter } from '@/lib/campaign/families'

/**
 * GET /api/campaigns/[id]/assessments
 *
 * Lightweight endpoint returning campaign_activities rows where
 * activity_kind = 'assessment' so surfaces (like the call list builder)
 * can offer a Specific Assessment filter. Returns only the minimal
 * columns needed to render an option + its rating shape:
 *   [{ activity_id, title, is_binary, template_key }, ...]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const campaignId = Number(id)
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // WP3.8 (wp3.8.md §2 A19): owned plus the parent's shared assessments.
    const campaignParent = await loadCampaignParent(supabase, campaignId)
    const { data, error } = await supabase
      .from('campaign_activities')
      .select('activity_id, title, is_binary, template_key')
      .or(familyActivityFilter(campaignId, campaignParent.parentId))
      .eq('activity_kind', 'assessment')
      .order('title', { ascending: true })

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET assessments error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch assessments' },
      { status: 500 }
    )
  }
}
