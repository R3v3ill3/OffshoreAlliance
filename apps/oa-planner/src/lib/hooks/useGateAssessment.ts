'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
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
        .single()

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

export function useUpdateGateCriterion() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      criterion_id: number
      current_value?: string
      evidence_notes?: string
      campaign_id: number
      gate_number: number
    }) => {
      const { campaign_id: _campaign_id, gate_number: _gate_number, criterion_id, current_value, evidence_notes } = params

      // Get the criterion to evaluate it
      const { data: criterion } = await supabase
        .from('gate_criteria')
        .select('*')
        .eq('criterion_id', criterion_id)
        .single()

      const updatedCriterion = { ...criterion!, current_value: current_value || null }
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

  return useMutation({
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
    },
  })
}
