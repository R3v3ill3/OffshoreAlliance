'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

export type StageSubjectKind = 'ambition' | 'activity' | 'wtp' | 'capacity' | 'soc'

export interface StageMappingRow {
  mapping_id: number
  section_plan_id: number
  subject_kind: StageSubjectKind
  subject_id: number
  stage_number: number
  confidence: number | null
  rationale: string | null
  model: string | null
  human_confirmed: boolean
  created_at: string
}

export interface StageCoverageRow {
  campaign_id: number
  section_plan_id: number
  section_name: string
  section_status: string
  stage_number: number
  subject_count: number
  subject_kinds: StageSubjectKind[]
  avg_confidence: number | null
  any_confirmed: boolean
}

const mappingsKey = (sectionPlanId: number) =>
  ['section-stage-mappings', sectionPlanId] as const

const coverageKey = (campaignId: number) =>
  ['campaign-stage-coverage', campaignId] as const

export function useSectionStageMappings(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: mappingsKey(sectionPlanId),
    queryFn: async (): Promise<StageMappingRow[]> => {
      const { data, error } = await supabase
        .from('section_plan_stage_mappings')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('stage_number')
      if (error) throw error
      return (data ?? []) as unknown as StageMappingRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useCampaignStageCoverage(campaignId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: coverageKey(campaignId),
    queryFn: async (): Promise<StageCoverageRow[]> => {
      const { data, error } = await supabase
        .from('v_campaign_section_stage_coverage')
        .select('*')
        .eq('campaign_id', campaignId)
      if (error) throw error
      return (data ?? []) as unknown as StageCoverageRow[]
    },
    enabled: Number.isFinite(campaignId) && campaignId > 0,
  })
}

export function useGenerateStageMapping(sectionPlanId: number, campaignId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { regenerate?: boolean } = {}) => {
      const res = await fetch(
        `/api/section-plans/${sectionPlanId}/ai/stage-mapping`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        },
      )
      if (!res.ok) throw new Error((await res.json()).error ?? 'mapping failed')
      return (await res.json()) as { mappings: StageMappingRow[] }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mappingsKey(sectionPlanId) })
      qc.invalidateQueries({ queryKey: coverageKey(campaignId) })
    },
  })
}

export function useConfirmStageMapping() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      mapping_id: number
      section_plan_id: number
      human_confirmed: boolean
    }) => {
      const { error } = await supabase
        .from('section_plan_stage_mappings')
        .update({ human_confirmed: params.human_confirmed })
        .eq('mapping_id', params.mapping_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: mappingsKey(vars.section_plan_id) })
      qc.invalidateQueries({ queryKey: ['campaign-stage-coverage'] })
    },
  })
}

export function useDeleteStageMapping() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { mapping_id: number; section_plan_id: number }) => {
      const { error } = await supabase
        .from('section_plan_stage_mappings')
        .delete()
        .eq('mapping_id', params.mapping_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: mappingsKey(vars.section_plan_id) })
      qc.invalidateQueries({ queryKey: ['campaign-stage-coverage'] })
    },
  })
}
