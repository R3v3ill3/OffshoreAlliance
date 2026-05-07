'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

export interface SectionSituationSnippet {
  snippet_id: number
  section_plan_id: number
  status_summary: string | null
  key_event: string | null
  agreement_expiry_override: string | null
  strategic_context: string | null
  workforce_summary: string | null
  notes: string | null
  derived_from_campaign_situation: boolean
  ai_generated: boolean
  created_at: string
  updated_at: string
}

const snippetKey = (sectionPlanId: number) =>
  ['section-situation-snippet', sectionPlanId] as const

const expiryKey = (sectionPlanId: number) =>
  ['section-resolved-expiry', sectionPlanId] as const

export function useSectionSituationSnippet(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: snippetKey(sectionPlanId),
    queryFn: async (): Promise<SectionSituationSnippet | null> => {
      const { data, error } = await supabase
        .from('section_plan_situation_snippets')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as SectionSituationSnippet | null) ?? null
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useResolvedAgreementExpiry(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: expiryKey(sectionPlanId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc(
        'section_plan_resolved_agreement_expiry',
        { p_section_plan_id: sectionPlanId },
      )
      if (error) throw error
      return (data as string | null) ?? null
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useSeedSectionSituationSnippet() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { section_plan_id: number }) => {
      const { data, error } = await supabase.rpc('seed_section_situation_snippet', {
        p_section_plan_id: params.section_plan_id,
      })
      if (error) throw error
      return data as unknown as SectionSituationSnippet
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: snippetKey(vars.section_plan_id) })
      qc.invalidateQueries({ queryKey: expiryKey(vars.section_plan_id) })
    },
  })
}

export interface UpdateSnippetInput {
  section_plan_id: number
  status_summary?: string | null
  key_event?: string | null
  agreement_expiry_override?: string | null
  strategic_context?: string | null
  workforce_summary?: string | null
  notes?: string | null
}

export function useUpsertSectionSituationSnippet() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (input: UpdateSnippetInput) => {
      // Upsert by section_plan_id (UNIQUE).
      const { data, error } = await supabase
        .from('section_plan_situation_snippets')
        .upsert(
          {
            section_plan_id: input.section_plan_id,
            status_summary: input.status_summary ?? null,
            key_event: input.key_event ?? null,
            agreement_expiry_override: input.agreement_expiry_override ?? null,
            strategic_context: input.strategic_context ?? null,
            workforce_summary: input.workforce_summary ?? null,
            notes: input.notes ?? null,
          },
          { onConflict: 'section_plan_id' },
        )
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as SectionSituationSnippet
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: snippetKey(vars.section_plan_id) })
      qc.invalidateQueries({ queryKey: expiryKey(vars.section_plan_id) })
    },
  })
}
