'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

export type SequenceTargetKind =
  | 'task'
  | 'assessment'
  | 'industrial_action'
  | 'woc_meeting'
  | 'phone_call_list'
  | 'sms_blast'
  | 'email_survey'
  | 'site_visit'

export type SequenceThresholdKind =
  | 'absolute_count'
  | 'percent_of_target'
  | 'any'

export interface SequenceRow {
  sequence_id: number
  section_plan_id: number
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SequenceStepRow {
  step_id: number
  sequence_id: number
  step_order: number
  source_activity_id: number | null
  target_activity_template_key: string
  target_activity_kind: SequenceTargetKind
  target_payload: Record<string, unknown> | null
  delay_minutes: number
}

export interface SequenceTriggerRow {
  trigger_id: number
  step_id: number
  event_kind: string
  outcome: string | null
  threshold_kind: SequenceThresholdKind
  threshold_value: number | null
}

export interface SequenceRunRow {
  run_id: number
  step_id: number
  triggered_at: string
  state: 'queued' | 'materialised' | 'skipped' | 'failed'
  materialised_activity_id: number | null
  notes: string | null
}

const sequencesKey = (sectionPlanId: number) =>
  ['section-sequences', sectionPlanId] as const

const stepsKey = (sequenceId: number) =>
  ['sequence-steps', sequenceId] as const

const triggersKey = (stepId: number) =>
  ['sequence-triggers', stepId] as const

const runsKey = (sequenceId: number) =>
  ['sequence-runs', sequenceId] as const

export function useSequences(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: sequencesKey(sectionPlanId),
    queryFn: async (): Promise<SequenceRow[]> => {
      const { data, error } = await supabase
        .from('activity_sequences')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as SequenceRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useSequenceSteps(sequenceId: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: stepsKey(sequenceId ?? 0),
    queryFn: async (): Promise<SequenceStepRow[]> => {
      if (!sequenceId) return []
      const { data, error } = await supabase
        .from('activity_sequence_steps')
        .select('*')
        .eq('sequence_id', sequenceId)
        .order('step_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as SequenceStepRow[]
    },
    enabled: !!sequenceId,
  })
}

export function useStepTriggers(stepId: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: triggersKey(stepId ?? 0),
    queryFn: async (): Promise<SequenceTriggerRow[]> => {
      if (!stepId) return []
      const { data, error } = await supabase
        .from('activity_sequence_triggers')
        .select('*')
        .eq('step_id', stepId)
      if (error) throw error
      return (data ?? []) as unknown as SequenceTriggerRow[]
    },
    enabled: !!stepId,
  })
}

export function useSequenceRuns(sequenceId: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: runsKey(sequenceId ?? 0),
    queryFn: async (): Promise<SequenceRunRow[]> => {
      if (!sequenceId) return []
      const { data, error } = await supabase
        .from('activity_sequence_runs')
        .select(
          'run_id, step_id, triggered_at, state, materialised_activity_id, notes, step:activity_sequence_steps!inner(sequence_id)',
        )
        .eq('step.sequence_id', sequenceId)
        .order('triggered_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as SequenceRunRow[]
    },
    enabled: !!sequenceId,
  })
}

export function useCreateSequence() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      name: string
      description?: string | null
    }) => {
      const { data, error } = await supabase
        .from('activity_sequences')
        .insert({
          section_plan_id: params.section_plan_id,
          name: params.name,
          description: params.description ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as SequenceRow
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: sequencesKey(vars.section_plan_id) }),
  })
}

export function useDeleteSequence() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { sequence_id: number; section_plan_id: number }) => {
      const { error } = await supabase
        .from('activity_sequences')
        .delete()
        .eq('sequence_id', params.sequence_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: sequencesKey(vars.section_plan_id) }),
  })
}

export function useCreateSequenceStep() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      sequence_id: number
      step_order: number
      source_activity_id?: number | null
      target_activity_template_key: string
      target_activity_kind: SequenceTargetKind
      target_payload?: Record<string, unknown>
      delay_minutes?: number
      // Optional trigger to insert in same transaction:
      trigger?: {
        event_kind: string
        outcome?: string | null
        threshold_kind: SequenceThresholdKind
        threshold_value?: number | null
      }
    }) => {
      const { data, error } = await supabase
        .from('activity_sequence_steps')
        .insert({
          sequence_id: params.sequence_id,
          step_order: params.step_order,
          source_activity_id: params.source_activity_id ?? null,
          target_activity_template_key: params.target_activity_template_key,
          target_activity_kind: params.target_activity_kind,
          target_payload: params.target_payload ?? {},
          delay_minutes: params.delay_minutes ?? 0,
        })
        .select('*')
        .single()
      if (error) throw error
      const step = data as unknown as SequenceStepRow
      if (params.trigger) {
        const { error: tErr } = await supabase.from('activity_sequence_triggers').insert({
          step_id: step.step_id,
          event_kind: params.trigger.event_kind,
          outcome: params.trigger.outcome ?? null,
          threshold_kind: params.trigger.threshold_kind,
          threshold_value: params.trigger.threshold_value ?? null,
        })
        if (tErr) throw tErr
      }
      return step
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: stepsKey(vars.sequence_id) })
      qc.invalidateQueries({ queryKey: ['sequence-runs'] })
    },
  })
}

export function useDeleteSequenceStep() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { step_id: number; sequence_id: number }) => {
      const { error } = await supabase
        .from('activity_sequence_steps')
        .delete()
        .eq('step_id', params.step_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: stepsKey(vars.sequence_id) })
    },
  })
}

export function useMaterialiseRun() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { run_id: number; sequence_id: number }) => {
      const { data, error } = await supabase.rpc('materialise_sequence_run', {
        p_run_id: params.run_id,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: runsKey(vars.sequence_id) })
      qc.invalidateQueries({ queryKey: ['section-activities'] })
    },
  })
}
