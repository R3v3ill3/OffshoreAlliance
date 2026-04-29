'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { P2wCompletion } from '@/lib/hooks/useCampaignsAllStats'

type P2wCompletionRow = {
  plan_id: number
  ambitions: boolean | null
  where_to_play: boolean | null
  theory: boolean | null
  capacities: boolean | null
  management: boolean | null
}

/**
 * P2W step completion per plan_id, for the given plan ids (e.g. one campaign's stage plans).
 */
export function useP2wCompletionByPlanIds(planIds: number[]): {
  p2wByPlanId: Map<number, P2wCompletion>
  isLoading: boolean
} {
  const supabase = createClient()
  const planIdsKey = planIds.slice().sort((a, b) => a - b).join(',')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['p2w-completion', planIdsKey],
    queryFn: async () => {
      if (planIds.length === 0) return []
      const { data, error } = await supabase.rpc('get_p2w_completion_by_plan_ids', {
        p_plan_ids: planIds,
      })
      if (error) throw error
      return (data ?? []) as P2wCompletionRow[]
    },
    enabled: planIds.length > 0,
    staleTime: 60_000,
  })

  const p2wByPlanId = useMemo((): Map<number, P2wCompletion> => {
    const byPlanId = new Map(rows.map((row) => [row.plan_id, row]))
    const map = new Map<number, P2wCompletion>()
    for (const pid of planIds) {
      const row = byPlanId.get(pid)
      map.set(pid, {
        ambitions: !!row?.ambitions,
        whereToPlay: !!row?.where_to_play,
        theory: !!row?.theory,
        capacities: !!row?.capacities,
        management: !!row?.management,
      })
    }
    return map
  }, [rows, planIds])

  return { p2wByPlanId, isLoading: planIds.length > 0 && isLoading }
}
