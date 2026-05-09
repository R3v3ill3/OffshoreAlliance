import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computePriorityScore } from '@/lib/phone/priority-scoring'
import type { PriorityOrder } from '@/lib/phone/priority-scoring'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const lid = parseInt(listId, 10)

    // Derive campaign_id from the list record.
    const { data: listRow } = await supabase
      .from('call_lists')
      .select('campaign_id')
      .eq('list_id', lid)
      .single()

    if (!listRow) return NextResponse.json({ error: 'List not found' }, { status: 404 })
    const campaignId = listRow.campaign_id

    const body = await req.json()
    const filters = body.filters || {}
    const priorityOrder: PriorityOrder | null = body.priority_order || null

    const listBuilderUrl = new URL(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/campaigns/${campaignId}/list-builder`
    )
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

    const workerRes = await fetch(listBuilderUrl.toString(), {
      headers: { cookie: req.headers.get('cookie') || '' },
    })
    if (!workerRes.ok) throw new Error('Failed to fetch workers from list builder')

    const workerJson = await workerRes.json()
    const allWorkers: {
      worker_id: number
      phone: string | null
      membership_status: string | null
    }[] = workerJson.success ? workerJson.data : workerJson

    // When explicit worker_ids are provided (wizard manual selection), filter to those.
    const workerIds: number[] | null = Array.isArray(body.worker_ids) ? body.worker_ids : null
    let eligible = workerIds
      ? allWorkers.filter((w) => workerIds.includes(w.worker_id))
      : allWorkers

    let withPhone = eligible.filter((w) => w.phone && w.phone.trim() !== '')

    if (withPhone.length === 0) {
      return NextResponse.json(
        { error: 'No workers with phone numbers match the filters' },
        { status: 400 }
      )
    }

    const eligibleIds = withPhone.map((w) => w.worker_id)

    // Connection map for scoring
    let connectionMap = new Map<number, Record<string, unknown>>()
    const { data: connections } = await supabase
      .from('worker_campaign_connections')
      .select('worker_id, connection_status, contact_count, preferred_contact_method')
      .eq('campaign_id', campaignId)
      .in('worker_id', eligibleIds)
    if (connections) {
      connectionMap = new Map(connections.map((c) => [c.worker_id, c]))
    }

    // Assessment filter
    let assessmentRatingMap = new Map<number, string | null>()
    const assessmentId: number | null = filters.assessment_id != null ? Number(filters.assessment_id) : null
    const needsAssessmentFilter = assessmentId != null && Array.isArray(filters.assessment_ratings) && filters.assessment_ratings.length > 0
    const needsAssessmentForOrder = assessmentId != null && (priorityOrder as PriorityOrder | null)?.by === 'assessment_rating'

    if (assessmentId != null && (needsAssessmentFilter || needsAssessmentForOrder)) {
      const { data: ratingRows } = await supabase
        .from('campaign_activity_ratings')
        .select('worker_id, rating, binary_value, rated_at')
        .eq('activity_id', assessmentId)
        .in('worker_id', eligibleIds)
        .order('rated_at', { ascending: false })

      const seen = new Set<number>()
      for (const row of ratingRows ?? []) {
        if (seen.has(row.worker_id)) continue
        seen.add(row.worker_id)
        const bucket = row.rating != null ? String(row.rating)
          : row.binary_value != null ? String(row.binary_value)
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

    // Rating filter
    let ratingMap = new Map<number, { cumulative_rating: number | null; last_activity_rating: number | null }>()
    const currentIds = withPhone.map((w) => w.worker_id)
    const needsRatings = filters.rating_min != null || filters.rating_max != null
      || filters.include_unrated === false
      || (priorityOrder as PriorityOrder | null)?.by === 'rating'

    if (currentIds.length > 0 && needsRatings) {
      const { data: ratings } = await supabase
        .from('campaign_worker_rating_summary')
        .select('worker_id, cumulative_rating, last_activity_rating')
        .eq('campaign_id', campaignId)
        .in('worker_id', currentIds)
      if (ratings) {
        ratingMap = new Map(ratings.map((r) => [r.worker_id, {
          cumulative_rating: r.cumulative_rating,
          last_activity_rating: r.last_activity_rating,
        }]))
      }
      const includeUnrated = filters.include_unrated !== false
      if (filters.rating_min != null || filters.rating_max != null || !includeUnrated) {
        const ratingMin = filters.rating_min != null ? Number(filters.rating_min) : null
        const ratingMax = filters.rating_max != null ? Number(filters.rating_max) : null
        withPhone = withPhone.filter((w) => {
          const score = ratingMap.get(w.worker_id)?.cumulative_rating ?? null
          if (score == null) return includeUnrated
          if (ratingMin != null && score < ratingMin) return false
          if (ratingMax != null && score > ratingMax) return false
          return true
        })
      }
    }

    if (withPhone.length === 0) {
      return NextResponse.json({ error: 'No workers with phone numbers match the filters' }, { status: 400 })
    }

    // Skip duplicates
    const existingIds = new Set<number>()
    const { data: existingItems } = await supabase
      .from('call_list_items')
      .select('worker_id')
      .eq('list_id', lid)
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
        return { list_id: lid, worker_id: w.worker_id, sort_order: i, priority_score: score, status: 'pending' as const }
      })
      .sort((a, b) => b.priority_score - a.priority_score)
      .map((item, i) => ({ ...item, sort_order: i }))

    if (newItems.length === 0) {
      return NextResponse.json({ message: 'All matching workers are already on the list', added: 0 })
    }

    const { error } = await supabase.from('call_list_items').insert(newItems)
    if (error) throw error

    await supabase
      .from('call_lists')
      .update({
        total_items: (existingItems?.length || 0) + newItems.length,
        source_filters: { ...filters, priority_order: priorityOrder },
      })
      .eq('list_id', lid)

    return NextResponse.json({
      message: `Added ${newItems.length} contacts to the call list`,
      added: newItems.length,
      skipped_no_phone: allWorkers.length - withPhone.length,
      skipped_duplicate: withPhone.length - newItems.length,
    })
  } catch (error) {
    console.error('POST /api/calls/lists/[listId]/populate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to populate list' },
      { status: 500 }
    )
  }
}
