'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StrengthOutcome = 'strong' | 'weak' | 'unclear'

export interface StrengthAssessmentRow {
  assessment_id: number
  campaign_id: number
  assessed_at: string
  eligible_count: number | null
  supportive_leader_count: number | null
  supporter_count: number | null
  neutral_count: number | null
  opposed_count: number | null
  oppositional_count: number | null
  unassessed_count: number | null
  percent_strike_ready: number | null
  percent_paid_membership: number | null
  readiness_criteria: Record<string, unknown> | null
  notes: string | null
  outcome: StrengthOutcome | null
  created_by: string | null
}

export interface StrengthAssessmentInputs {
  campaign_id: number
  eligible_count: number | null
  supportive_leader_count: number | null
  supporter_count: number | null
  neutral_count: number | null
  opposed_count: number | null
  oppositional_count: number | null
  unassessed_count: number | null
  total_ambition_universe: number | null
  total_supportive: number | null
  total_unassessed: number | null
  overall_supportive_pct: number | null
}

export interface CreateSnapshotParams {
  campaign_id: number
  eligible_count?: number | null
  supportive_leader_count?: number | null
  supporter_count?: number | null
  neutral_count?: number | null
  opposed_count?: number | null
  oppositional_count?: number | null
  unassessed_count?: number | null
  percent_strike_ready?: number | null
  percent_paid_membership?: number | null
  readiness_criteria?: Record<string, unknown> | null
  notes?: string | null
  outcome: StrengthOutcome
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetches all bargaining strength assessments for a campaign,
 * most-recent first. Provides a `createSnapshot` mutation to
 * append a new immutable assessment row.
 */
export function useStrengthAssessment(campaignId: number) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const assessmentsQuery = useQuery({
    queryKey: ['strength-assessments', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bargaining_strength_assessments')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('assessed_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as StrengthAssessmentRow[]
    },
    enabled: !!campaignId,
  })

  const inputsQuery = useQuery({
    queryKey: ['strength-assessment-inputs', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_strength_assessment_inputs')
        .select('*')
        .eq('campaign_id', campaignId)
        .maybeSingle()

      if (error) throw error
      return (data ?? null) as StrengthAssessmentInputs | null
    },
    enabled: !!campaignId,
  })

  const createSnapshot = useAuthAwareMutation({
    mutationFn: async (params: CreateSnapshotParams) => {
      const { campaign_id, ...rest } = params
      const { data, error } = await supabase
        .from('bargaining_strength_assessments')
        .insert({ campaign_id, ...rest })
        .select()
        .single()

      if (error) throw error
      return data as StrengthAssessmentRow
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['strength-assessments', variables.campaign_id],
      })
      // Decision points may reference the new assessment
      queryClient.invalidateQueries({
        queryKey: ['decision-points', variables.campaign_id],
      })
    },
  })

  return {
    /** All assessments for the campaign, most-recent first */
    assessments: assessmentsQuery.data ?? [],
    /** The most recent assessment (null if none yet) */
    latestAssessment: assessmentsQuery.data?.[0] ?? null,
    /** Live pre-population data from v_strength_assessment_inputs */
    inputs: inputsQuery.data,
    isLoading: assessmentsQuery.isLoading || inputsQuery.isLoading,
    isFetching: assessmentsQuery.isFetching || inputsQuery.isFetching,
    error: assessmentsQuery.error ?? inputsQuery.error ?? null,
    /** Append a new immutable strength assessment row */
    createSnapshot,
  }
}
