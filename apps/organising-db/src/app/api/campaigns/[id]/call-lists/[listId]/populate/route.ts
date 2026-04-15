import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computePriorityScore } from '@/lib/phone/priority-scoring'
import type { PriorityOrder } from '@/lib/phone/priority-scoring'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const filters = body.filters || {}
    const priorityOrder: PriorityOrder | null = body.priority_order || null

    // Build list-builder URL with all supported standard filters
    const listBuilderUrl = new URL(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/campaigns/${campaignId}/list-builder`)
    if (filters.membership) listBuilderUrl.searchParams.set('membership', filters.membership)
    if (filters.roles) listBuilderUrl.searchParams.set('roles', filters.roles)
    if (filters.employer_id) listBuilderUrl.searchParams.set('employer_id', filters.employer_id)
    if (filters.worksite_id) listBuilderUrl.searchParams.set('worksite_id', filters.worksite_id)
    if (filters.occupation) listBuilderUrl.searchParams.set('occupation', filters.occupation)

    const workerRes = await fetch(listBuilderUrl.toString(), {
      headers: { cookie: req.headers.get('cookie') || '' },
    })

    if (!workerRes.ok) {
      throw new Error('Failed to fetch workers from list builder')
    }

    const workerJson = await workerRes.json()
    let workers: {
      worker_id: number
      phone: string | null
      membership_status: string | null
    }[] = workerJson.success ? workerJson.data : workerJson

    // Filter to only workers with phone numbers
    let withPhone = workers.filter((w) => w.phone && w.phone.trim() !== '')

    const workerIds = withPhone.map((w) => w.worker_id)

    if (workerIds.length === 0) {
      return NextResponse.json(
        { error: 'No workers with phone numbers match the filters' },
        { status: 400 }
      )
    }

    // Fetch campaign connections for scoring
    let connectionMap = new Map<number, Record<string, unknown>>()
    const { data: connections } = await supabase
      .from('worker_campaign_connections')
      .select('worker_id, support_level, connection_status, contact_count, preferred_contact_method')
      .eq('campaign_id', parseInt(campaignId))
      .in('worker_id', workerIds)

    if (connections) {
      connectionMap = new Map(connections.map((c) => [c.worker_id, c]))
    }

    // Filter by support_levels if specified
    if (filters.support_levels && Array.isArray(filters.support_levels) && filters.support_levels.length > 0) {
      const allowedSupportLevels = new Set<string>(filters.support_levels)
      withPhone = withPhone.filter((w) => {
        const conn = connectionMap.get(w.worker_id)
        const level = conn?.support_level as string | null | undefined
        return level && allowedSupportLevels.has(level)
      })
    }

    // Fetch activity ratings for rating filter and scoring
    let ratingMap = new Map<number, { cumulative_rating: number | null; last_activity_rating: number | null }>()
    const currentWorkerIds = withPhone.map((w) => w.worker_id)

    if (currentWorkerIds.length > 0 && (filters.rating_min != null || filters.rating_max != null || priorityOrder?.by === 'rating')) {
      const { data: ratings } = await supabase
        .from('campaign_worker_rating_summary')
        .select('worker_id, cumulative_rating, last_activity_rating')
        .eq('campaign_id', parseInt(campaignId))
        .in('worker_id', currentWorkerIds)

      if (ratings) {
        ratingMap = new Map(ratings.map((r) => [r.worker_id, {
          cumulative_rating: r.cumulative_rating,
          last_activity_rating: r.last_activity_rating,
        }]))
      }

      // Apply rating range filters
      if (filters.rating_min != null || filters.rating_max != null) {
        const ratingMin = filters.rating_min != null ? Number(filters.rating_min) : null
        const ratingMax = filters.rating_max != null ? Number(filters.rating_max) : null

        withPhone = withPhone.filter((w) => {
          const rating = ratingMap.get(w.worker_id)
          const score = rating?.cumulative_rating ?? null
          if (score == null) return false
          if (ratingMin != null && score < ratingMin) return false
          if (ratingMax != null && score > ratingMax) return false
          return true
        })
      }
    }

    if (withPhone.length === 0) {
      return NextResponse.json(
        { error: 'No workers with phone numbers match the filters' },
        { status: 400 }
      )
    }

    // Check for duplicates already on the list
    const existingIds = new Set<number>()
    const { data: existingItems } = await supabase
      .from('call_list_items')
      .select('worker_id')
      .eq('list_id', parseInt(listId))

    existingItems?.forEach((item) => existingIds.add(item.worker_id))

    const newItems = withPhone
      .filter((w) => !existingIds.has(w.worker_id))
      .map((w, i) => {
        const conn = connectionMap.get(w.worker_id) as Record<string, string | number | null | undefined> | undefined
        const rating = ratingMap.get(w.worker_id)
        const score = computePriorityScore({
          support_level: (conn?.support_level as string) || null,
          connection_status: (conn?.connection_status as string) || null,
          contact_count: (conn?.contact_count as number) || 0,
          membership_status: w.membership_status,
          has_phone: true,
          preferred_contact_method: (conn?.preferred_contact_method as string) || null,
          cumulative_rating: rating?.cumulative_rating ?? null,
          priority_order: priorityOrder,
        })

        return {
          list_id: parseInt(listId),
          worker_id: w.worker_id,
          sort_order: i,
          priority_score: score,
          status: 'pending' as const,
        }
      })
      // Sort descending by priority_score so the call queue starts with highest priority
      .sort((a, b) => b.priority_score - a.priority_score)
      // Re-assign sort_order after sorting
      .map((item, i) => ({ ...item, sort_order: i }))

    if (newItems.length === 0) {
      return NextResponse.json({ message: 'All matching workers are already on the list', added: 0 })
    }

    const { error } = await supabase
      .from('call_list_items')
      .insert(newItems)

    if (error) throw error

    await supabase
      .from('call_lists')
      .update({
        total_items: (existingItems?.length || 0) + newItems.length,
        source_filters: { ...filters, priority_order: priorityOrder },
      })
      .eq('list_id', parseInt(listId))

    return NextResponse.json({
      message: `Added ${newItems.length} contacts to the call list`,
      added: newItems.length,
      skipped_no_phone: workers.length - withPhone.length - newItems.length + newItems.length,
      skipped_duplicate: withPhone.length - newItems.length,
    })
  } catch (error) {
    console.error('Populate call-list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to populate list' },
      { status: 500 }
    )
  }
}
