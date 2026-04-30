'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import type {
  PiaAction,
  PiaParticipationRow,
  CreatePiaActionInput,
  ConcludePiaActionInput,
} from '@/types/pia-types'

// ── Query keys ──────────────────────────────────────────────

export const piaQueryKeys = {
  actions: (campaignId: number) => ['pia-actions', campaignId] as const,
  action: (actionId: number) => ['pia-action', actionId] as const,
  participation: (actionId: number) => ['pia-participation', actionId] as const,
}

// ── Fetch all PIA actions for a campaign ────────────────────

export function usePiaActions(campaignId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: piaQueryKeys.actions(campaignId),
    queryFn: async (): Promise<PiaAction[]> => {
      const { data, error } = await supabase
        .from('pia_actions')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('escalation_level', { ascending: true })
        .order('action_starts_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as PiaAction[]
    },
    enabled: !!campaignId,
  })
}

// ── Fetch participation stats for a single action ───────────

export function usePiaParticipation(actionId: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: piaQueryKeys.participation(actionId ?? 0),
    queryFn: async (): Promise<PiaParticipationRow | null> => {
      const { data, error } = await supabase
        .from('v_pia_participation_by_action')
        .select('*')
        .eq('action_id', actionId!)
        .maybeSingle()
      if (error) throw error
      return data as PiaParticipationRow | null
    },
    enabled: !!actionId,
  })
}

// ── Create a new PIA action ──────────────────────────────────

export function useCreatePiaAction(campaignId: number) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (input: CreatePiaActionInput): Promise<PiaAction> => {
      const { data, error } = await supabase
        .from('pia_actions')
        .insert({
          campaign_id: campaignId,
          pabo_id: input.pabo_id ?? null,
          pabo_question_id: input.pabo_question_id ?? null,
          action_type: input.action_type,
          escalation_level: input.escalation_level,
          notice_given_at: input.notice_given_at ?? null,
          action_starts_at: input.action_starts_at ?? null,
          action_ends_at: input.action_ends_at ?? null,
          target_population_definition: input.target_population_definition ?? null,
          participation_target_count: input.participation_target_count ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as PiaAction
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: piaQueryKeys.actions(campaignId) })
    },
  })
}

// ── Conclude a PIA action ────────────────────────────────────

export function useConcludePiaAction(campaignId: number) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (input: ConcludePiaActionInput): Promise<PiaAction> => {
      const { data, error } = await supabase
        .from('pia_actions')
        .update({
          is_concluded: true,
          concluded_at: input.concluded_at ?? new Date().toISOString(),
          outcome_summary: input.outcome_summary ?? null,
          notes: input.notes ?? null,
        })
        .eq('action_id', input.action_id)
        .select()
        .single()
      if (error) throw error
      return data as PiaAction
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: piaQueryKeys.actions(campaignId) })
      queryClient.invalidateQueries({ queryKey: piaQueryKeys.action(vars.action_id) })
      queryClient.invalidateQueries({ queryKey: piaQueryKeys.participation(vars.action_id) })
    },
  })
}
