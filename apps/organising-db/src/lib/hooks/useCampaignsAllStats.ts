'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isWorkerMemberLike } from '@/lib/campaign/constants'

export interface P2wCompletion {
  ambitions: boolean
  whereToPlay: boolean
  theory: boolean
  capacities: boolean
  management: boolean
}

export interface CampaignRatingBuckets {
  noRating: number
  r1: number
  r2: number
  r3: number
  r4: number
}

export interface CampaignAggStats {
  namedWorkers: number
  phoneCount: number
  emailCount: number
  memberLikeCount: number
  ouCount: number
  workersInAnyOu: number
  leadershipTotal: number
  ratings: CampaignRatingBuckets
  participationCount: number
  p2wByPlanId: Map<number, P2wCompletion>
}

const EMPTY_STATS: CampaignAggStats = {
  namedWorkers: 0,
  phoneCount: 0,
  emailCount: 0,
  memberLikeCount: 0,
  ouCount: 0,
  workersInAnyOu: 0,
  leadershipTotal: 0,
  ratings: { noRating: 0, r1: 0, r2: 0, r3: 0, r4: 0 },
  participationCount: 0,
  p2wByPlanId: new Map(),
}

function normalizeRel<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

/** Derived display helpers so callers don't repeat this logic */
export function formatLeadershipRatio(
  leadershipTotal: number,
  totalWorkerEstimate: number | null
): string {
  if (leadershipTotal === 0) return '—'
  const estimate = totalWorkerEstimate ?? 0
  if (estimate === 0) return `${leadershipTotal} leaders`
  const ratio = Math.round(estimate / leadershipTotal)
  return `1 : ${ratio}`
}

export function formatPct(numerator: number, denominator: number | null): string {
  const d = denominator ?? 0
  if (d === 0) return '—'
  return `${pct(numerator, d)}%`
}

/**
 * Batch-fetches stats for ALL campaigns at once and returns a Map keyed by
 * campaign_id. Pass `planIds` (a flat list of all plan_ids from all campaigns'
 * stage plans) so the P2W step queries are scoped correctly.
 */
export function useCampaignsAllStats(planIds: number[]): {
  statsMap: Map<number, CampaignAggStats>
  isLoading: boolean
} {
  const supabase = createClient()
  const planIdsKey = planIds.slice().sort((a, b) => a - b).join(',')

  // --- Membership + worker details ---
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['all-campaign-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_worker_membership')
        .select(
          `campaign_id, worker_id,
           worker:workers(
             worker_id, phone, email, is_bargaining_rep,
             member_role_type:member_role_types(role_name),
             union_membership_type:union_membership_types(type_name)
           )`
        )
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  // --- Ratings ---
  const { data: ratings = [], isLoading: ratingsLoading } = useQuery({
    queryKey: ['all-campaign-ratings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_worker_rating_summary')
        .select('campaign_id, worker_id, cumulative_rating')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  // --- Organising units ---
  const { data: ous = [], isLoading: ousLoading } = useQuery({
    queryKey: ['all-campaign-ous'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_organising_units')
        .select('campaign_id, ou_id')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  const allOuIds = useMemo(() => ous.map((o) => o.ou_id), [ous])

  const { data: ouAssign = [], isLoading: ouAssignLoading } = useQuery({
    queryKey: ['all-campaign-worker-ou', allOuIds.join(',')],
    queryFn: async () => {
      if (allOuIds.length === 0) return []
      const { data, error } = await supabase
        .from('campaign_worker_ou')
        .select('ou_id, worker_id')
        .in('ou_id', allOuIds)
      if (error) throw error
      return data ?? []
    },
    enabled: allOuIds.length > 0,
    staleTime: 60_000,
  })

  // --- P2W step completion (keyed by plan_id) ---
  const { data: ambitionPlanIds = [], isLoading: ambitionsLoading } = useQuery({
    queryKey: ['all-p2w-ambitions', planIdsKey],
    queryFn: async () => {
      if (planIds.length === 0) return []
      const { data, error } = await supabase
        .from('plan_ambitions')
        .select('plan_id')
        .in('plan_id', planIds)
      if (error) throw error
      return [...new Set((data ?? []).map((r) => r.plan_id))]
    },
    enabled: planIds.length > 0,
    staleTime: 60_000,
  })

  const { data: wtpPlanIds = [], isLoading: wtpLoading } = useQuery({
    queryKey: ['all-p2w-wtp', planIdsKey],
    queryFn: async () => {
      if (planIds.length === 0) return []
      const { data, error } = await supabase
        .from('plan_where_to_play')
        .select('plan_id')
        .in('plan_id', planIds)
      if (error) throw error
      return [...new Set((data ?? []).map((r) => r.plan_id))]
    },
    enabled: planIds.length > 0,
    staleTime: 60_000,
  })

  const { data: theoryPlanIds = [], isLoading: theoryLoading } = useQuery({
    queryKey: ['all-p2w-theory', planIdsKey],
    queryFn: async () => {
      if (planIds.length === 0) return []
      const { data, error } = await supabase
        .from('plan_theory_of_winning')
        .select('plan_id')
        .in('plan_id', planIds)
      if (error) throw error
      return [...new Set((data ?? []).map((r) => r.plan_id))]
    },
    enabled: planIds.length > 0,
    staleTime: 60_000,
  })

  const { data: capacitiesPlanIds = [], isLoading: capacitiesLoading } = useQuery({
    queryKey: ['all-p2w-capacities', planIdsKey],
    queryFn: async () => {
      if (planIds.length === 0) return []
      const { data, error } = await supabase
        .from('plan_capacities')
        .select('plan_id')
        .in('plan_id', planIds)
      if (error) throw error
      return [...new Set((data ?? []).map((r) => r.plan_id))]
    },
    enabled: planIds.length > 0,
    staleTime: 60_000,
  })

  const { data: mgmtPlanIds = [], isLoading: mgmtLoading } = useQuery({
    queryKey: ['all-p2w-management', planIdsKey],
    queryFn: async () => {
      if (planIds.length === 0) return []
      const { data, error } = await supabase
        .from('plan_management_systems')
        .select('plan_id')
        .in('plan_id', planIds)
      if (error) throw error
      return [...new Set((data ?? []).map((r) => r.plan_id))]
    },
    enabled: planIds.length > 0,
    staleTime: 60_000,
  })

  const isLoading =
    membersLoading ||
    ratingsLoading ||
    ousLoading ||
    ouAssignLoading ||
    (planIds.length > 0 &&
      (ambitionsLoading || wtpLoading || theoryLoading || capacitiesLoading || mgmtLoading))

  // --- Build per-campaign P2W completion map ---
  const p2wByPlanId = useMemo((): Map<number, P2wCompletion> => {
    const ambSet = new Set(ambitionPlanIds)
    const wtpSet = new Set(wtpPlanIds)
    const theorySet = new Set(theoryPlanIds)
    const capSet = new Set(capacitiesPlanIds)
    const mgmtSet = new Set(mgmtPlanIds)
    const map = new Map<number, P2wCompletion>()
    for (const pid of planIds) {
      map.set(pid, {
        ambitions: ambSet.has(pid),
        whereToPlay: wtpSet.has(pid),
        theory: theorySet.has(pid),
        capacities: capSet.has(pid),
        management: mgmtSet.has(pid),
      })
    }
    return map
  }, [ambitionPlanIds, wtpPlanIds, theoryPlanIds, capacitiesPlanIds, mgmtPlanIds, planIds])

  // --- Build OU lookup: ou_id → campaign_id ---
  const ouToCampaign = useMemo((): Map<number, number> => {
    const map = new Map<number, number>()
    for (const ou of ous) {
      map.set(ou.ou_id, ou.campaign_id)
    }
    return map
  }, [ous])

  // --- Aggregate per campaign ---
  const statsMap = useMemo((): Map<number, CampaignAggStats> => {
    const map = new Map<number, CampaignAggStats>()

    // -- Membership stats --
    for (const m of members) {
      const cid: number = (m as { campaign_id: number }).campaign_id
      if (!map.has(cid)) {
        map.set(cid, {
          ...EMPTY_STATS,
          ratings: { noRating: 0, r1: 0, r2: 0, r3: 0, r4: 0 },
          p2wByPlanId,
        })
      }
      const s = map.get(cid)!

      const w = normalizeRel((m as { worker: unknown }).worker) as {
        phone?: string | null
        email?: string | null
        is_bargaining_rep?: boolean | null
        member_role_type: { role_name: string } | null
        union_membership_type: { type_name: string } | null
      } | null

      s.namedWorkers++

      const roleName = normalizeRel(w?.member_role_type)?.role_name
      const typeName = normalizeRel(w?.union_membership_type)?.type_name
      const isBargRep = w?.is_bargaining_rep

      if (isWorkerMemberLike({ unionMembershipTypeName: typeName, memberRoleName: roleName, isBargainingRep: isBargRep })) {
        s.memberLikeCount++
      }

      if (roleName === 'delegate' || roleName === 'Activist' || roleName === 'contact') {
        s.leadershipTotal++
      }
      if (isBargRep) s.leadershipTotal++

      if (w?.phone?.trim()) s.phoneCount++
      if (w?.email?.trim()) s.emailCount++
    }

    // -- OU counts --
    const ouCountByCampaign = new Map<number, number>()
    for (const ou of ous) {
      ouCountByCampaign.set(ou.campaign_id, (ouCountByCampaign.get(ou.campaign_id) ?? 0) + 1)
    }

    // -- Workers in any OU --
    const workersInOuByCampaign = new Map<number, Set<number>>()
    for (const a of ouAssign) {
      const cid = ouToCampaign.get(a.ou_id)
      if (cid == null) continue
      if (!workersInOuByCampaign.has(cid)) workersInOuByCampaign.set(cid, new Set())
      workersInOuByCampaign.get(cid)!.add(a.worker_id)
    }

    // -- Ratings --
    for (const r of ratings) {
      const cid: number = (r as { campaign_id: number }).campaign_id
      if (!map.has(cid)) {
        map.set(cid, {
          ...EMPTY_STATS,
          ratings: { noRating: 0, r1: 0, r2: 0, r3: 0, r4: 0 },
          p2wByPlanId,
        })
      }
      const s = map.get(cid)!
      const cum = (r as { cumulative_rating: number | null }).cumulative_rating

      s.participationCount++

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

    // -- Merge OU stats into each campaign entry --
    for (const [cid, s] of map.entries()) {
      s.ouCount = ouCountByCampaign.get(cid) ?? 0
      s.workersInAnyOu = workersInOuByCampaign.get(cid)?.size ?? 0
      s.p2wByPlanId = p2wByPlanId
    }

    // Also create empty entries for campaigns that appear in OU data but not membership
    for (const [cid, count] of ouCountByCampaign.entries()) {
      if (!map.has(cid)) {
        map.set(cid, {
          ...EMPTY_STATS,
          ouCount: count,
          workersInAnyOu: workersInOuByCampaign.get(cid)?.size ?? 0,
          ratings: { noRating: 0, r1: 0, r2: 0, r3: 0, r4: 0 },
          p2wByPlanId,
        })
      }
    }

    return map
  }, [members, ous, ouAssign, ratings, ouToCampaign, p2wByPlanId])

  return { statsMap, isLoading }
}

/** Get stats for a single campaign from the map, with a safe fallback */
export function getStatsForCampaign(
  statsMap: Map<number, CampaignAggStats>,
  campaignId: number
): CampaignAggStats {
  return (
    statsMap.get(campaignId) ?? {
      ...EMPTY_STATS,
      ratings: { noRating: 0, r1: 0, r2: 0, r3: 0, r4: 0 },
      p2wByPlanId: new Map(),
    }
  )
}
