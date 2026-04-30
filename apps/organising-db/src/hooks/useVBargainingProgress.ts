'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import type { VBargainingProgress } from '@oa/db-types'

/**
 * Fetches all rows from the v_bargaining_progress view.
 * Returns one row per campaign currently in current_phase = 'bargaining_to_win'.
 *
 * Used by the /reports/bargaining page.
 */
export function useVBargainingProgress() {
  const supabase = createClient()
  const { user } = useAuth()

  return useQuery<VBargainingProgress[]>({
    queryKey: ['v-bargaining-progress'],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('v_bargaining_progress' as any)
        .select('*')
        .order('campaign_name' as any, { ascending: true })

      if (error) throw error
      return (data ?? []) as VBargainingProgress[]
    },
    enabled: !!user,
    staleTime: 60_000,
  })
}
