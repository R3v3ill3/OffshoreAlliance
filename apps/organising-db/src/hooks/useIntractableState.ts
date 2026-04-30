'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface IntractableStateRow {
  campaign_id: number
  days_elapsed: number
  days_remaining_to_threshold: number
  state: 'safe' | 'approaching' | 'eligible' | 'applied' | 'declared' | 'arbitrated'
  state_label: string
  headline: string
  bargaining_commenced_at: string
  nine_month_threshold_at: string
  intractable_application_filed_at: string | null
  intractable_declaration_made_at: string | null
  arbitration_outcome_recorded_at: string | null
  last_reviewed_at: string | null
  notes: string | null
}

/**
 * Reads a single row from v_intractable_state for the given campaign.
 * Returns null when the campaign has no intractable_bargaining_tracker row
 * (i.e. bargaining has not yet been tracked for this campaign).
 */
export function useIntractableState(campaignId: number | null | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['intractable-state', campaignId],
    queryFn: async (): Promise<IntractableStateRow | null> => {
      if (!campaignId) return null
      try {
        const { data, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('v_intractable_state' as any)
          .select('*')
          .eq('campaign_id', campaignId)
          .maybeSingle()
        if (error || !data) return null
        return data as IntractableStateRow
      } catch {
        return null
      }
    },
    enabled: !!campaignId,
    staleTime: 60_000,
  })
}
