'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

/* ─────────────── Where-to-Play ─────────────── */

export interface WtpCategory {
  category_id: number
  category_name: string
  applies_to_stages: number[] | null
}

export interface WtpOption {
  option_id: number
  category_id: number
  option_text: string
  description: string | null
}

export interface SectionWtpRow {
  wtp_id: number
  section_plan_id: number
  wtp_category_id: number
  wtp_option_id: number | null
  custom_text: string | null
  rationale: string | null
  is_exclusion: boolean | null
  priority: number | null
  sort_order: number | null
  linked_ambition_id: number | null
  // joined:
  category?: { category_id: number; category_name: string } | null
  option?: { option_id: number; option_text: string } | null
}

const wtpKey = (sectionPlanId: number) => ['section-wtp', sectionPlanId] as const

export function useWtpCategories() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['wtp-categories'],
    queryFn: async (): Promise<WtpCategory[]> => {
      const { data, error } = await supabase
        .from('wtp_categories')
        .select('category_id, category_name, applies_to_stages, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as WtpCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useWtpOptions(categoryId: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['wtp-options', categoryId],
    queryFn: async (): Promise<WtpOption[]> => {
      if (!categoryId) return []
      const { data, error } = await supabase
        .from('wtp_options')
        .select('option_id, category_id, option_text, description')
        .eq('category_id', categoryId)
        .order('option_text')
      if (error) throw error
      return (data ?? []) as unknown as WtpOption[]
    },
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSectionWtp(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: wtpKey(sectionPlanId),
    queryFn: async (): Promise<SectionWtpRow[]> => {
      const { data, error } = await supabase
        .from('plan_where_to_play')
        .select(
          'wtp_id, section_plan_id, wtp_category_id, wtp_option_id, custom_text, rationale, is_exclusion, priority, sort_order, linked_ambition_id, category:wtp_categories(category_id, category_name), option:wtp_options(option_id, option_text)',
        )
        .eq('section_plan_id', sectionPlanId)
        .order('priority', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as SectionWtpRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useCreateSectionWtp() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      wtp_category_id: number
      wtp_option_id?: number | null
      custom_text?: string | null
      rationale?: string | null
      is_exclusion?: boolean
      priority?: number | null
      linked_ambition_id?: number | null
    }) => {
      const { data, error } = await supabase
        .from('plan_where_to_play')
        .insert({
          section_plan_id: params.section_plan_id,
          plan_id: null,
          wtp_category_id: params.wtp_category_id,
          wtp_option_id: params.wtp_option_id ?? null,
          custom_text: params.custom_text ?? null,
          rationale: params.rationale ?? null,
          is_exclusion: params.is_exclusion ?? false,
          priority: params.priority ?? null,
          linked_ambition_id: params.linked_ambition_id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: wtpKey(vars.section_plan_id) }),
  })
}

export function useUpdateSectionWtp() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      wtp_id: number
      section_plan_id: number
      rationale?: string | null
      is_exclusion?: boolean
      priority?: number | null
      linked_ambition_id?: number | null
      custom_text?: string | null
    }) => {
      const { wtp_id, section_plan_id: _, ...rest } = params
      const { error } = await supabase.from('plan_where_to_play').update(rest).eq('wtp_id', wtp_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: wtpKey(vars.section_plan_id) }),
  })
}

export function useDeleteSectionWtp() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { wtp_id: number; section_plan_id: number }) => {
      const { error } = await supabase.from('plan_where_to_play').delete().eq('wtp_id', params.wtp_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: wtpKey(vars.section_plan_id) }),
  })
}

/* ─────────────── Capacities ─────────────── */

export interface CapacityOption {
  option_id: number
  option_text: string
  category: string
  description: string | null
}

export interface SectionCapacityRow {
  capacity_id: number
  section_plan_id: number
  capacity_option_id: number | null
  custom_text: string | null
  status: string | null
  gap_description: string | null
  resolution_plan: string | null
  resolution_date: string | null
  linked_ambition_id: number | null
  sort_order: number | null
  option?: { option_id: number; option_text: string; category: string } | null
}

const capKey = (sectionPlanId: number) => ['section-capacities', sectionPlanId] as const

export function useCapacityOptions() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['capacity-options'],
    queryFn: async (): Promise<CapacityOption[]> => {
      const { data, error } = await supabase
        .from('capacity_options')
        .select('option_id, option_text, category, description')
        .order('category')
        .order('option_text')
      if (error) throw error
      return (data ?? []) as unknown as CapacityOption[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSectionCapacities(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: capKey(sectionPlanId),
    queryFn: async (): Promise<SectionCapacityRow[]> => {
      const { data, error } = await supabase
        .from('plan_capacities')
        .select(
          'capacity_id, section_plan_id, capacity_option_id, custom_text, status, gap_description, resolution_plan, resolution_date, linked_ambition_id, sort_order, option:capacity_options(option_id, option_text, category)',
        )
        .eq('section_plan_id', sectionPlanId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as SectionCapacityRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useCreateSectionCapacity() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      capacity_option_id?: number | null
      custom_text?: string | null
      status?: string
      gap_description?: string | null
      resolution_plan?: string | null
      resolution_date?: string | null
      linked_ambition_id?: number | null
    }) => {
      const { data, error } = await supabase
        .from('plan_capacities')
        .insert({
          section_plan_id: params.section_plan_id,
          plan_id: null,
          capacity_option_id: params.capacity_option_id ?? null,
          custom_text: params.custom_text ?? null,
          status: params.status ?? 'available',
          gap_description: params.gap_description ?? null,
          resolution_plan: params.resolution_plan ?? null,
          resolution_date: params.resolution_date ?? null,
          linked_ambition_id: params.linked_ambition_id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: capKey(vars.section_plan_id) }),
  })
}

export function useUpdateSectionCapacity() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      capacity_id: number
      section_plan_id: number
      status?: string
      gap_description?: string | null
      resolution_plan?: string | null
      resolution_date?: string | null
      linked_ambition_id?: number | null
      custom_text?: string | null
    }) => {
      const { capacity_id, section_plan_id: _, ...rest } = params
      const { error } = await supabase.from('plan_capacities').update(rest).eq('capacity_id', capacity_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: capKey(vars.section_plan_id) }),
  })
}

export function useDeleteSectionCapacity() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { capacity_id: number; section_plan_id: number }) => {
      const { error } = await supabase
        .from('plan_capacities')
        .delete()
        .eq('capacity_id', params.capacity_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: capKey(vars.section_plan_id) }),
  })
}
