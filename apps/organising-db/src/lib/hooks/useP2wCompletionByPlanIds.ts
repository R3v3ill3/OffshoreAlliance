'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { P2wCompletion } from '@/lib/hooks/useCampaignsAllStats'

/**
 * P2W step completion per plan_id, for the given plan ids (e.g. one campaign's stage plans).
 */
export function useP2wCompletionByPlanIds(planIds: number[]): {
  p2wByPlanId: Map<number, P2wCompletion>
  isLoading: boolean
} {
  const supabase = createClient()
  const planIdsKey = planIds.slice().sort((a, b) => a - b).join(',')

  const { data: ambitionPlanIds = [], isLoading: ambitionsLoading } = useQuery({
    queryKey: ['p2w-ambitions', planIdsKey],
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
    queryKey: ['p2w-wtp', planIdsKey],
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
    queryKey: ['p2w-theory', planIdsKey],
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
    queryKey: ['p2w-capacities', planIdsKey],
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
    queryKey: ['p2w-management', planIdsKey],
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
    planIds.length > 0 &&
    (ambitionsLoading || wtpLoading || theoryLoading || capacitiesLoading || mgmtLoading)

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

  return { p2wByPlanId, isLoading }
}
