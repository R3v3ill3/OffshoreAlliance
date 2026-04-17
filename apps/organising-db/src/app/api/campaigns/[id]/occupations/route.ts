import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/campaigns/[id]/occupations
 *
 * Returns distinct worker.occupation values for workers who belong to this
 * campaign (via campaign_worker_membership), with a count of workers per
 * value. Used by the list builder to offer a structured occupation
 * dropdown instead of free-text filtering.
 *
 * Shape: [{ occupation: string, count: number }, ...]
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
      .from('campaign_worker_membership')
      .select('workers!inner(occupation)')
      .eq('campaign_id', campaignId)

    if (error) throw error

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const w = (row as unknown as { workers: { occupation: string | null } | null }).workers
      const occ = w?.occupation?.trim()
      if (!occ) continue
      counts.set(occ, (counts.get(occ) ?? 0) + 1)
    }

    const out = [...counts.entries()]
      .map(([occupation, count]) => ({ occupation, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return a.occupation.localeCompare(b.occupation)
      })

    return NextResponse.json(out)
  } catch (error) {
    console.error('GET occupations error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch occupations' },
      { status: 500 }
    )
  }
}
