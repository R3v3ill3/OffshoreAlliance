'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface FoundationalReadiness {
  campaign_id: number
  universe_size: number
  workers_allocated: number
  workers_with_contact: number
  workers_with_rating: number
  ous_missing_leaders: number
}

export function useFoundationalReadiness(campaignId: number | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['foundational-readiness', campaignId],
    queryFn: async (): Promise<FoundationalReadiness | null> => {
      if (!campaignId) return null
      try {
        const { data, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('v_campaign_foundational_readiness' as any)
          .select('*')
          .eq('campaign_id', campaignId)
          .maybeSingle()
        if (error || !data) return null
        return data as FoundationalReadiness
      } catch {
        return null
      }
    },
    enabled: !!campaignId,
    staleTime: 60_000,
  })
}

export function useFoundationalReadinessGaps(campaignId: number | null | undefined) {
  const result = useFoundationalReadiness(campaignId)
  const data = result.data

  const universeBase = data ? Math.max(data.universe_size, 1) : 1

  return {
    ...result,
    allocatedPct: data ? data.workers_allocated / universeBase : 0,
    contactPct: data ? data.workers_with_contact / universeBase : 0,
    ratedPct: data ? data.workers_with_rating / universeBase : 0,
    ratingsGapPct: data ? 1 - data.workers_with_rating / universeBase : 0,
  }
}
