'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isWorkerMemberLike } from '@/lib/campaign/constants'
import { useP2wCompletionByPlanIds } from '@/lib/hooks/useP2wCompletionByPlanIds'
import type {
  CampaignAggStats,
  CampaignRatingBuckets,
  P2wCompletion,
} from '@/lib/hooks/useCampaignsAllStats'

export interface CampaignStagePlanRow {
  plan_id: number
  stage_number: number
  stage_name: string
  status: string
}

export type CampaignListMemberRow = {
  worker_id: number
  worker: {
    phone?: string | null
    email?: string | null
    is_bargaining_rep?: boolean | null
    member_role_type: { role_name: string } | null
    union_membership_type: { type_name: string } | null
    non_oa_union_option: { badge_initials: string } | null
  } | null
}

export type CampaignOrganisingUnitRow = {
  ou_id: number
  name: string | null
  ou_type: string | null
  total_workers_estimated: number | null
}

const EMPTY_RATINGS: CampaignRatingBuckets = {
  noRating: 0,
  r1: 0,
  r2: 0,
  r3: 0,
  r4: 0,
}

function normalizeRel<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

export type CampaignListRatingRow = {
  worker_id: number
  cumulative_rating: number | null
  has_supportive_activity_rating: boolean | null
}

function buildCampaignAggStats(
  members: CampaignListMemberRow[],
  ratings: CampaignListRatingRow[],
  ouCount: number,
  workersInAnyOu: number,
  p2wByPlanId: Map<number, P2wCompletion>
): CampaignAggStats {
  const s: CampaignAggStats = {
    namedWorkers: 0,
    phoneCount: 0,
    emailCount: 0,
    memberLikeCount: 0,
    ouCount,
    workersInAnyOu,
    leadershipTotal: 0,
    ratings: { ...EMPTY_RATINGS },
    participationCount: 0,
    p2wByPlanId,
  }

  for (const m of members) {
    const w = normalizeRel(m.worker)
    s.namedWorkers++

    const roleName = normalizeRel(w?.member_role_type)?.role_name
    const typeName = normalizeRel(w?.union_membership_type)?.type_name
    const isBargRep = w?.is_bargaining_rep

    if (
      isWorkerMemberLike({
        unionMembershipTypeName: typeName,
        memberRoleName: roleName,
        isBargainingRep: isBargRep,
      })
    ) {
      s.memberLikeCount++
    }

    if (roleName === 'delegate' || roleName === 'Activist' || roleName === 'contact') {
      s.leadershipTotal++
    }
    if (isBargRep) s.leadershipTotal++

    if (w?.phone?.trim()) s.phoneCount++
    if (w?.email?.trim()) s.emailCount++
  }

  for (const r of ratings) {
    if (r.has_supportive_activity_rating) s.participationCount++
    const cum = r.cumulative_rating
    if (cum == null) {
      s.ratings.noRating++
    } else if (cum < 2) {
      s.ratings.r1++
    } else if (cum < 3) {
      s.ratings.r2++
    } else if (cum < 4) {
      s.ratings.r3++
    } else {
      s.ratings.r4++
    }
  }

  return s
}

/**
 * Same aggregates as `useCampaignsAllStats` / `getStatsForCampaign`, scoped to one campaign
 * (lighter queries than loading all campaigns).
 */
export function useCampaignListStats(campaignId: number): {
  stats: CampaignAggStats
  totalWorkerEstimate: number
  stagePlans: CampaignStagePlanRow[]
  organisingUnits: CampaignOrganisingUnitRow[]
  members: CampaignListMemberRow[]
  ratings: CampaignListRatingRow[]
  ouAssign: { ou_id: number; worker_id: number }[]
  isLoading: boolean
} {
  const supabase = createClient()
  const cid = Number(campaignId)
  const enabled = Number.isFinite(cid)

  const { data: campaignRow, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign-estimate', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('total_worker_estimate')
        .eq('campaign_id', cid)
        .single()
      if (error) throw error
      return data as { total_worker_estimate: number | null }
    },
    enabled,
    staleTime: 60_000,
  })

  const { data: stagePlans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['campaign-stage-plans', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_stage_plans')
        .select('plan_id, stage_number, stage_name, status')
        .eq('campaign_id', cid)
        .order('stage_number')
      if (error) throw error
      return (data ?? []) as CampaignStagePlanRow[]
    },
    enabled,
    staleTime: 60_000,
  })

  const planIds = useMemo(() => stagePlans.map((p) => p.plan_id), [stagePlans])
  const { p2wByPlanId, isLoading: p2wLoading } = useP2wCompletionByPlanIds(planIds)

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['campaign-list-stats-members', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_worker_membership')
        .select(
          `worker_id,
           worker:workers(
             worker_id, phone, email, is_bargaining_rep,
             member_role_type:member_role_types(role_name),
             union_membership_type:union_membership_types(type_name),
             non_oa_union_option:non_oa_union_options!workers_non_oa_union_option_id_fkey(badge_initials)
           )`
        )
        .eq('campaign_id', cid)
      if (error) throw error
      return data ?? []
    },
    enabled,
    staleTime: 60_000,
  })

  const { data: ratings = [], isLoading: ratingsLoading } = useQuery({
    queryKey: ['campaign-list-stats-ratings', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_worker_rating_summary')
        .select('worker_id, cumulative_rating, has_supportive_activity_rating')
        .eq('campaign_id', cid)
      if (error) throw error
      return (data ?? []) as CampaignListRatingRow[]
    },
    enabled,
    staleTime: 60_000,
  })

  const { data: organisingUnits = [], isLoading: ousLoading } = useQuery({
    queryKey: ['campaign-list-stats-ous', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_organising_units')
        .select('ou_id, name, ou_type, total_workers_estimated')
        .eq('campaign_id', cid)
        .order('name')
      if (error) throw error
      return (data ?? []) as CampaignOrganisingUnitRow[]
    },
    enabled,
    staleTime: 60_000,
  })

  const ouIds = useMemo(() => organisingUnits.map((o) => o.ou_id), [organisingUnits])

  const { data: ouAssign = [], isLoading: ouAssignLoading } = useQuery({
    queryKey: ['campaign-list-stats-worker-ou', cid, ouIds.join(',')],
    queryFn: async () => {
      if (ouIds.length === 0) return []
      const { data, error } = await supabase
        .from('campaign_worker_ou')
        .select('ou_id, worker_id')
        .in('ou_id', ouIds)
      if (error) throw error
      return data ?? []
    },
    enabled: enabled && ouIds.length > 0,
    staleTime: 60_000,
  })

  const workersInAnyOu = useMemo(() => {
    const set = new Set<number>()
    for (const a of ouAssign) {
      set.add(a.worker_id)
    }
    return set.size
  }, [ouAssign])

  const stats = useMemo(
    () =>
      buildCampaignAggStats(
        members as unknown as CampaignListMemberRow[],
        ratings,
        organisingUnits.length,
        workersInAnyOu,
        p2wByPlanId
      ),
    [members, ratings, organisingUnits.length, workersInAnyOu, p2wByPlanId]
  )

  const isLoading =
    !enabled ||
    campaignLoading ||
    plansLoading ||
    membersLoading ||
    ratingsLoading ||
    ousLoading ||
    (ouIds.length > 0 && ouAssignLoading) ||
    p2wLoading

  const totalWorkerEstimate = campaignRow?.total_worker_estimate ?? 0

  return {
    stats,
    totalWorkerEstimate,
    stagePlans,
    organisingUnits,
    members: members as unknown as CampaignListMemberRow[],
    ratings,
    ouAssign,
    isLoading,
  }
}

/** Build campaign-style stats for a subset of workers (e.g. one organising unit). */
export function buildCampaignAggStatsForWorkerSubset(
  workerIds: Set<number>,
  members: CampaignListMemberRow[],
  ratings: CampaignListRatingRow[],
  ouCount: number,
  workersInAnyOuForSubset: number,
  p2wByPlanId: Map<number, P2wCompletion>
): CampaignAggStats {
  const subMembers = members.filter((m) => workerIds.has(m.worker_id))
  const subRatings = ratings.filter((r) => workerIds.has(r.worker_id))
  return buildCampaignAggStats(subMembers, subRatings, ouCount, workersInAnyOuForSubset, p2wByPlanId)
}
