/**
 * GET /api/sms/org-worker-lists — saved worker lists on visible
 * (non-episode) campaigns, for standalone SMS audience picking.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: campaigns, error: campErr } = await supabase
      .from('campaigns')
      .select('campaign_id, name')
      .eq('is_sms_episode', false)
    if (campErr) throw campErr
    const ids = (campaigns ?? []).map((c) => c.campaign_id)
    if (ids.length === 0) return NextResponse.json([])

    const nameById = new Map(
      (campaigns ?? []).map((c) => [c.campaign_id, c.name]),
    )

    const { data: lists, error } = await supabase
      .from('campaign_worker_lists')
      .select(
        `list_id, campaign_id, name, status,
         items_count:campaign_worker_list_items(count)`,
      )
      .in('campaign_id', ids)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) throw error

    return NextResponse.json(
      (lists ?? []).map((wl) => ({
        ...wl,
        campaign_name: nameById.get(wl.campaign_id as number) ?? 'Campaign',
      })),
    )
  } catch (error) {
    console.error('GET /api/sms/org-worker-lists error:', error)
    return errorResponse('Failed to fetch worker lists', error)
  }
}
