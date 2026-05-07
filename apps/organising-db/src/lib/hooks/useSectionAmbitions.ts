'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

/**
 * The four template-aligned ambition slots. Persisted as the (sort_order)
 * field so this stays a UI convention rather than a schema change.
 */
export const SECTION_AMBITION_CATEGORIES = [
  { key: 'primary',    label: 'Primary',    description: 'The headline outcome for this period.' },
  { key: 'secondary',  label: 'Secondary',  description: 'A supporting outcome that strengthens the primary.' },
  { key: 'organising', label: 'Organising', description: 'A capacity / structure outcome — leaders identified, contacts mapped.' },
  { key: 'industrial', label: 'Industrial', description: 'PABO readiness / vote intent / strike-readiness.' },
] as const

export type SectionAmbitionCategoryKey =
  (typeof SECTION_AMBITION_CATEGORIES)[number]['key']

export interface SectionAmbitionRow {
  ambition_id: number
  section_plan_id: number
  custom_text: string | null
  target_value: string | null
  target_unit: string | null
  target_date: string | null
  metric_type: string | null
  is_achieved: boolean | null
  achieved_date: string | null
  ambition_scope: string | null
  sort_order: number | null
  created_at: string | null
}

const ambitionsKey = (sectionPlanId: number) =>
  ['section-ambitions', sectionPlanId] as const

export function useSectionAmbitions(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: ambitionsKey(sectionPlanId),
    queryFn: async (): Promise<SectionAmbitionRow[]> => {
      const { data, error } = await supabase
        .from('plan_ambitions')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as SectionAmbitionRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export interface CreateSectionAmbitionInput {
  section_plan_id: number
  custom_text: string
  target_value?: string | null
  target_unit?: string | null
  target_date?: string | null
  metric_type?: string | null
  ambition_scope?: 'campaign_setup' | 'worker_assessable'
  sort_order?: number
}

export function useCreateSectionAmbition() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (input: CreateSectionAmbitionInput) => {
      const { data, error } = await supabase
        .from('plan_ambitions')
        .insert({
          section_plan_id: input.section_plan_id,
          plan_id: null,
          custom_text: input.custom_text,
          target_value: input.target_value ?? null,
          target_unit: input.target_unit ?? null,
          target_date: input.target_date ?? null,
          metric_type: input.metric_type ?? null,
          ambition_scope: input.ambition_scope ?? 'worker_assessable',
          sort_order: input.sort_order ?? 0,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as SectionAmbitionRow
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ambitionsKey(vars.section_plan_id) })
    },
  })
}

export function useUpdateSectionAmbition() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      ambition_id: number
      section_plan_id: number
      custom_text?: string
      target_value?: string | null
      target_unit?: string | null
      target_date?: string | null
      metric_type?: string | null
      ambition_scope?: 'campaign_setup' | 'worker_assessable'
      is_achieved?: boolean
      achieved_date?: string | null
      sort_order?: number
    }) => {
      const { ambition_id, section_plan_id: _, ...rest } = params
      const { data, error } = await supabase
        .from('plan_ambitions')
        .update(rest)
        .eq('ambition_id', ambition_id)
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as SectionAmbitionRow
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ambitionsKey(vars.section_plan_id) })
    },
  })
}

export function useDeleteSectionAmbition() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { ambition_id: number; section_plan_id: number }) => {
      const { error } = await supabase
        .from('plan_ambitions')
        .delete()
        .eq('ambition_id', params.ambition_id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ambitionsKey(vars.section_plan_id) })
    },
  })
}
