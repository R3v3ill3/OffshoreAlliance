import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    const { data, error } = await supabase
      .from('campaign_activities')
      .select('activity_id, title, is_binary, template_key')
      .eq('campaign_id', campaignId)
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
