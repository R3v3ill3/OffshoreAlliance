'use client'

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import type { P2wStepOverride, P2wTabId } from '@/lib/planning/p2w-step-completion'

type OverrideMap = Partial<Record<P2wTabId, P2wStepOverride>>

/**
 * Persisted P2W step overrides on `campaign_stage_plans.step_overrides` (JSONB).
 *
 * Replaces the prior localStorage implementation so overrides sync across
 * browsers + users. Reads through React Query for cache + invalidation, writes
 * via an optimistic-style mutation (cache patched immediately, refetch on
 * settle).
 */
export function useP2wStepOverrides(campaignId: number, stageNumber: number) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const queryKey = ['p2w-step-overrides', campaignId, stageNumber] as const

  const { data: overrides = {} } = useQuery({
    queryKey,
    queryFn: async (): Promise<OverrideMap> => {
      const { data, error } = await supabase
        .from('campaign_stage_plans')
        .select('step_overrides')
        .eq('campaign_id', campaignId)
        .eq('stage_number', stageNumber)
        .maybeSingle()
      if (error) throw error
      const raw = (data as { step_overrides?: unknown } | null)?.step_overrides
      if (!raw || typeof raw !== 'object') return {}
      return raw as OverrideMap
    },
    // Stage planning is bursty — a stale-time of 30s avoids hammering the DB
    // when the user toggles between steps in quick succession.
    staleTime: 30_000,
  })

  const updateMutation = useAuthAwareMutation({
    mutationFn: async (next: OverrideMap) => {
      const { error } = await supabase
        .from('campaign_stage_plans')
        .update({ step_overrides: next })
        .eq('campaign_id', campaignId)
        .eq('stage_number', stageNumber)
      if (error) throw error
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<OverrideMap>(queryKey)
      queryClient.setQueryData<OverrideMap>(queryKey, next)
      return { prev }
    },
    onError: (_err, _next, ctx) => {
      const previous = (ctx as { prev?: OverrideMap } | undefined)?.prev
      if (previous) queryClient.setQueryData(queryKey, previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const setOverride = useCallback(
    (tab: P2wTabId, value: P2wStepOverride) => {
      const next = { ...overrides, [tab]: value }
      updateMutation.mutate(next)
    },
    [overrides, updateMutation]
  )

  const memoOverrides = useMemo(() => overrides, [overrides])

  return { overrides: memoOverrides, setOverride }
}
