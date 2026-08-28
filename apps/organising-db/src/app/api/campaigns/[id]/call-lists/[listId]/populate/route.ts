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
    if (filters.occupation) {
      const occVal = Array.isArray(filters.occupation)
        ? filters.occupation.join(',')
        : filters.occupation
      if (occVal) listBuilderUrl.searchParams.set('occupation', occVal)
    }
    if (filters.facts) {
      const factsVal = typeof filters.facts === 'string'
        ? filters.facts
        : JSON.stringify(filters.facts)
      listBuilderUrl.searchParams.set('facts', factsVal)
    }

    const workerRes = await fetch(listBuilderUrl.toString(), {
      headers: { cookie: req.headers.get('cookie') || '' },
    })

    if (!workerRes.ok) {
      throw new Error('Failed to fetch workers from list builder')
    }

    const workerJson = await workerRes.json()
    const workers: {
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

    // Fetch campaign connections for scoring (connection_status, contact_count, etc.)
    let connectionMap = new Map<number, Record<string, unknown>>()
    const { data: connections } = await supabase
      .from('worker_campaign_connections')
      .select('worker_id, connection_status, contact_count, preferred_contact_method')
      .eq('campaign_id', parseInt(campaignId))
      .in('worker_id', workerIds)

    if (connections) {
      connectionMap = new Map(connections.map((c) => [c.worker_id, c]))
    }

    // Specific Assessment filter — replaces the legacy support_levels filter.
    // assessment_id: numeric campaign_activities.activity_id for activity_kind='assessment'
    // assessment_ratings: array of bucket keys:
    //   numeric: '1'..'5', 'unassessed'
    //   binary:  'true', 'false', 'unassessed'
    let assessmentRatingMap = new Map<number, string | null>()
    const assessmentId: number | null = filters.assessment_id != null
      ? Number(filters.assessment_id)
      : null
    const needsAssessmentFilter =
      assessmentId != null &&
      Array.isArray(filters.assessment_ratings) &&
      filters.assessment_ratings.length > 0
    const needsAssessmentForOrder =
      assessmentId != null && priorityOrder?.by === 'assessment_rating'

    if (assessmentId != null && (needsAssessmentFilter || needsAssessmentForOrder)) {
      const { data: ratingRows } = await supabase
        .from('campaign_activity_ratings')
        .select('worker_id, rating, binary_value, rated_at')
        .eq('activity_id', assessmentId)
        .in('worker_id', workerIds)
        .order('rated_at', { ascending: false })

      // Keep only the most recent row per worker (rows already sorted desc by rated_at).
      const seen = new Set<number>()
      for (const row of ratingRows ?? []) {
        if (seen.has(row.worker_id)) continue
        seen.add(row.worker_id)
        const bucket =
          row.rating != null
            ? String(row.rating)
            : row.binary_value != null
              ? String(row.binary_value)
              : null
        assessmentRatingMap.set(row.worker_id, bucket)
      }

      if (needsAssessmentFilter) {
        const hasUnassessed = filters.assessment_ratings.includes('unassessed')
        const concrete = filters.assessment_ratings.filter((r: string) => r !== 'unassessed')
        withPhone = withPhone.filter((w) => {
          const bucket = assessmentRatingMap.get(w.worker_id) ?? null
          if (!bucket) return hasUnassessed
          return concrete.includes(bucket)
        })
      }
    }

    // Fetch cumulative ratings for rating filter and scoring
    let ratingMap = new Map<number, { cumulative_rating: number | null; last_activity_rating: number | null }>()
    const currentWorkerIds = withPhone.map((w) => w.worker_id)

    const needsRatings = filters.rating_min != null || filters.rating_max != null
      || filters.include_unrated === false
      || priorityOrder?.by === 'rating'
    if (currentWorkerIds.length > 0 && needsRatings) {
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
      // include_unrated (default true) controls whether workers with no rating pass through
      const includeUnrated = filters.include_unrated !== false
      if (filters.rating_min != null || filters.rating_max != null || !includeUnrated) {
        const ratingMin = filters.rating_min != null ? Number(filters.rating_min) : null
        const ratingMax = filters.rating_max != null ? Number(filters.rating_max) : null

        withPhone = withPhone.filter((w) => {
          const score = ratingMap.get(w.worker_id)?.cumulative_rating ?? null
          if (score == null) return includeUnrated  // no rating: include only if allowed
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
          connection_status: (conn?.connection_status as string) || null,
          contact_count: (conn?.contact_count as number) || 0,
          membership_status: w.membership_status,
          has_phone: true,
          preferred_contact_method: (conn?.preferred_contact_method as string) || null,
          cumulative_rating: rating?.cumulative_rating ?? null,
          assessment_rating_bucket: assessmentRatingMap.get(w.worker_id) ?? null,
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
