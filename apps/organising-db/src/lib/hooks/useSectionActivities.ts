'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

export interface SectionActivityRow {
  activity_id: number
  campaign_id: number
  section_plan_id: number | null
  title: string
  description: string | null
  template_key: string | null
  activity_kind: string | null
  is_custom: boolean | null
  created_at: string | null
}

const activitiesKey = (sectionPlanId: number) =>
  ['section-activities', sectionPlanId] as const

export function useSectionActivities(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: activitiesKey(sectionPlanId),
    queryFn: async (): Promise<SectionActivityRow[]> => {
      const { data, error } = await supabase
        .from('campaign_activities')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as SectionActivityRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useCreateSectionActivity() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      campaign_id: number
      section_plan_id: number
      title: string
      description?: string | null
      activity_kind: string
      template_key?: string | null
    }) => {
      const { data, error } = await supabase
        .from('campaign_activities')
        .insert({
          campaign_id: params.campaign_id,
          section_plan_id: params.section_plan_id,
          title: params.title,
          description: params.description ?? null,
          activity_kind: params.activity_kind,
          template_key: params.template_key ?? null,
          is_custom: true,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as SectionActivityRow
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: activitiesKey(vars.section_plan_id) }),
  })
}

export function useDeleteSectionActivity() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { activity_id: number; section_plan_id: number }) => {
      const { error } = await supabase
        .from('campaign_activities')
        .delete()
        .eq('activity_id', params.activity_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: activitiesKey(vars.section_plan_id) }),
  })
}
