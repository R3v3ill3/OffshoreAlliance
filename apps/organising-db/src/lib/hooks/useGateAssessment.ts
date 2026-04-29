'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import { evaluateCriterion } from '@/lib/utils/gate-logic'

export function useGateAssessment(campaignId: number, gateNumber: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['gate', campaignId, gateNumber],
    queryFn: async () => {
      const { data: gate, error } = await supabase
        .from('gate_definitions')
        .select(`
          *,
          gate_criteria(*),
          gate_assessments(*)
        `)
        .eq('campaign_id', campaignId)
        .eq('gate_number', gateNumber)
        .order('assessment_date', { referencedTable: 'gate_assessments', ascending: false })
        .maybeSingle()

      if (error) throw error
      return gate
    },
    enabled: !!campaignId && !!gateNumber,
  })
}

export function useAllGates(campaignId: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['gates', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gate_definitions')
        .select(`
          *,
          gate_criteria(*),
          gate_assessments(assessment_id, outcome, assessment_date)
        `)
        .eq('campaign_id', campaignId)
        .order('gate_number')

      if (error) throw error
      return data
    },
    enabled: !!campaignId,
  })
}

export function usePlanAmbitionsForGate(campaignId: number, stageNumber: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['gate-ambitions', campaignId, stageNumber],
    queryFn: async () => {
      const { data: plan, error: planError } = await supabase
        .from('campaign_stage_plans')
        .select('plan_id')
        .eq('campaign_id', campaignId)
        .eq('stage_number', stageNumber)
        .maybeSingle()

      if (planError) throw planError
      if (!plan) return []

      const { data, error } = await supabase
        .from('plan_ambitions')
        .select(
          '*, ambition_options(option_text, category, has_variable, variable_label, variable_type)'
        )
        .eq('plan_id', plan.plan_id)
        .order('sort_order')

      if (error) throw error
      return data ?? []
    },
    enabled: !!campaignId && !!stageNumber,
  })
}

export function useUpdatePlanAmbitionProgress() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: {
      ambition_id: number
      current_value?: string
      evidence_notes?: string
      /** When true, the value is staff-set and ignores derived ambition_progress. */
      current_value_overridden?: boolean
      current_value_override_reason?: string | null
      campaign_id: number
      gate_number: number
    }) => {
      const {
        ambition_id,
        current_value,
        evidence_notes,
        current_value_overridden,
        current_value_override_reason,
      } = params

      const updates: Record<string, unknown> = {
        current_value: current_value ?? null,
        evidence_notes: evidence_notes ?? null,
      }
      if (current_value_overridden != null) {
        updates.current_value_overridden = current_value_overridden
      }
      if (current_value_override_reason !== undefined) {
        updates.current_value_override_reason = current_value_override_reason
      }

      const { error } = await supabase
        .from('plan_ambitions')
        .update(updates)
        .eq('ambition_id', ambition_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['gate-ambitions', variables.campaign_id, variables.gate_number],
      })
      queryClient.invalidateQueries({ queryKey: ['stage-plan-ambitions'] })
      queryClient.invalidateQueries({ queryKey: ['gates', variables.campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaign_id] })
      queryClient.invalidateQueries({
        queryKey: ['campaign-ambitions-by-stage', variables.campaign_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['ambition-progress', variables.campaign_id],
      })
    },
  })
}

/**
 * Fetch the derived `ambition_progress` rollup view for an entire
 * campaign. Returns one row per worker_assessable ambition in the
 * campaign; callers filter by plan_ambition_id as needed.
 */
export function useAmbitionProgress(campaignId: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['ambition-progress', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ambition_progress')
        .select('*')
        .eq('campaign_id', campaignId)

      if (error) throw error
      return data ?? []
    },
    enabled: !!campaignId,
  })
}

export function useUpdateGateCriterion() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: {
      criterion_id: number
      current_value?: string
      evidence_notes?: string
      campaign_id: number
      gate_number: number
    }) => {
      const { campaign_id: _campaign_id, gate_number: _gate_number, criterion_id, current_value, evidence_notes } = params

      // Get the criterion to evaluate it. Use maybeSingle so a missing row
      // doesn't throw PGRST116 — we explicitly handle the null case below.
      const { data: criterion } = await supabase
        .from('gate_criteria')
        .select('*')
        .eq('criterion_id', criterion_id)
        .maybeSingle()

      if (!criterion) {
        throw new Error(`Gate criterion ${criterion_id} not found`)
      }

      const updatedCriterion = { ...criterion, current_value: current_value || null }
      const is_met = evaluateCriterion(updatedCriterion as Parameters<typeof evaluateCriterion>[0])

      const { error } = await supabase
        .from('gate_criteria')
        .update({
          current_value: current_value || null,
          evidence_notes: evidence_notes || null,
          is_met,
          updated_at: new Date().toISOString(),
        })
        .eq('criterion_id', criterion_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gate', variables.campaign_id, variables.gate_number] })
      queryClient.invalidateQueries({ queryKey: ['gates', variables.campaign_id] })
    },
  })
}

export function useSubmitGateAssessment() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: {
      gate_id: number
      outcome: 'passed' | 'failed' | 'override_approved' | 'deferred'
      override_justification?: string
      notes?: string
      snapshot?: Record<string, unknown>
      campaign_id: number
      gate_number: number
    }) => {
      const { campaign_id: _campaign_id2, gate_number: _gate_number2, ...assessmentData } = params

      const { data, error } = await supabase
        .from('gate_assessments')
        .insert({
          gate_id: assessmentData.gate_id,
          outcome: assessmentData.outcome,
          override_justification: assessmentData.override_justification ?? null,
          notes: assessmentData.notes ?? null,
          snapshot: (assessmentData.snapshot ?? null) as null,
          assessment_date: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gate', variables.campaign_id, variables.gate_number] })
      queryClient.invalidateQueries({ queryKey: ['gates', variables.campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaign_id] })
      queryClient.invalidateQueries({
        queryKey: ['gate-ambitions', variables.campaign_id, variables.gate_number],
      })
      queryClient.invalidateQueries({
        queryKey: ['campaign-ambitions-by-stage', variables.campaign_id],
      })
    },
  })
}

export function useCampaignAmbitionsByStage(campaignId: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['campaign-ambitions-by-stage', campaignId],
    queryFn: async () => {
      const { data: plans, error: e1 } = await supabase
        .from('campaign_stage_plans')
        .select('plan_id, stage_number')
        .eq('campaign_id', campaignId)

      if (e1) throw e1
      if (!plans?.length) return {} as Record<number, unknown[]>

      const planIds = plans.map((p) => p.plan_id)
      const { data: ambitions, error: e2 } = await supabase
        .from('plan_ambitions')
        .select(
          '*, ambition_options(option_text, category, has_variable, variable_label, variable_type)'
        )
        .in('plan_id', planIds)

      if (e2) throw e2

      const planToStage = Object.fromEntries(plans.map((p) => [p.plan_id, p.stage_number]))
      const byStage: Record<number, typeof ambitions> = {}
      for (const row of ambitions || []) {
        const sn = planToStage[row.plan_id]
        if (sn == null) continue
        if (!byStage[sn]) byStage[sn] = []
        byStage[sn].push(row)
      }
      return byStage
    },
    enabled: !!campaignId,
  })
}
