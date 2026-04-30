'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionScenario =
  | 'good_offer'
  | 'drags_on'
  | 'employer_launches_proposal'

export type MemberVoteOutcome = 'yes' | 'no' | 'not_yet' | 'n_a'

export type DecisionStrengthOutcome = 'strong' | 'weak' | 'unclear' | 'n_a'

export type DecisionResolution =
  | 'settled'
  | 'route_to_pabo'
  | 'route_to_capacity_building'
  | 'route_to_ratification'
  | 'pending'

export interface DecisionPointRow {
  decision_id: number
  campaign_id: number
  triggered_at: string
  scenario: DecisionScenario | null
  member_vote_outcome: MemberVoteOutcome | null
  strength_assessment_id: number | null
  strength_outcome: DecisionStrengthOutcome | null
  resolution: DecisionResolution | null
  notes: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_by: string | null
  created_at: string
}

export interface CreateDecisionPointParams {
  campaign_id: number
  scenario: DecisionScenario
  member_vote_outcome?: MemberVoteOutcome | null
  strength_assessment_id?: number | null
  strength_outcome?: DecisionStrengthOutcome | null
  resolution?: DecisionResolution | null
  notes?: string | null
}

export interface ResolveDecisionPointParams {
  decision_id: number
  campaign_id: number
  resolution: Exclude<DecisionResolution, 'pending'>
  notes?: string | null
  resolved_at?: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetches all bargaining decision points for a campaign,
 * most-recent first. Provides:
 *   - `createDecisionPoint` — logs a new decision moment
 *   - `resolveDecisionPoint` — marks a pending decision as resolved
 */
export function useDecisionPoints(campaignId: number) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const decisionPointsQuery = useQuery({
    queryKey: ['decision-points', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bargaining_decision_points')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('triggered_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as DecisionPointRow[]
    },
    enabled: !!campaignId,
  })

  const createDecisionPoint = useAuthAwareMutation({
    mutationFn: async (params: CreateDecisionPointParams) => {
      const { campaign_id, ...rest } = params
      const { data, error } = await supabase
        .from('bargaining_decision_points')
        .insert({
          campaign_id,
          resolution: rest.resolution ?? 'pending',
          ...rest,
        })
        .select()
        .single()

      if (error) throw error
      return data as DecisionPointRow
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['decision-points', variables.campaign_id],
      })
    },
  })

  const resolveDecisionPoint = useAuthAwareMutation({
    mutationFn: async (params: ResolveDecisionPointParams) => {
      const { decision_id, campaign_id: _cid, notes, resolution, resolved_at } = params
      const { error } = await supabase
        .from('bargaining_decision_points')
        .update({
          resolution,
          notes: notes ?? null,
          resolved_at: resolved_at ?? new Date().toISOString(),
        })
        .eq('decision_id', decision_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['decision-points', variables.campaign_id],
      })
    },
  })

  const activeDecision =
    decisionPointsQuery.data?.find((d) => d.resolution === 'pending') ?? null

  return {
    /** All decision points for the campaign, most-recent first */
    decisionPoints: decisionPointsQuery.data ?? [],
    /** The first pending (unresolved) decision, or null */
    activeDecision,
    isLoading: decisionPointsQuery.isLoading,
    isFetching: decisionPointsQuery.isFetching,
    error: decisionPointsQuery.error ?? null,
    /** Log a new bargaining decision moment */
    createDecisionPoint,
    /** Mark a pending decision as resolved */
    resolveDecisionPoint,
  }
}
