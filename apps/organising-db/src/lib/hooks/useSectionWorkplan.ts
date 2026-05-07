'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

export interface WorkplanRow {
  target_id: number
  section_plan_id: number
  day_of_week: number
  target_date: string
  activity_id: number | null
  activity_label: string | null
  calls_target: number | null
  notes: string | null
  activity_title: string | null
  activity_kind: string | null
  completed_count: number | null
  outcomes_summary: string | null
}

const workplanKey = (sectionPlanId: number) =>
  ['section-workplan', sectionPlanId] as const

export function useSectionWorkplan(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: workplanKey(sectionPlanId),
    queryFn: async (): Promise<WorkplanRow[]> => {
      const { data, error } = await supabase
        .from('v_section_plan_workplan')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('target_date')
      if (error) throw error
      return (data ?? []) as unknown as WorkplanRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useUpsertWorkplanTarget() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      target_id?: number
      section_plan_id: number
      day_of_week: number
      target_date: string
      activity_id?: number | null
      activity_label?: string | null
      calls_target?: number | null
      notes?: string | null
    }) => {
      const { target_id, ...rest } = params
      if (target_id) {
        const { data, error } = await supabase
          .from('section_plan_workplan_targets')
          .update(rest)
          .eq('target_id', target_id)
          .select('*')
          .single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase
        .from('section_plan_workplan_targets')
        .insert(rest)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: workplanKey(vars.section_plan_id) }),
  })
}

export function useDeleteWorkplanTarget() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { target_id: number; section_plan_id: number }) => {
      const { error } = await supabase
        .from('section_plan_workplan_targets')
        .delete()
        .eq('target_id', params.target_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: workplanKey(vars.section_plan_id) }),
  })
}

/* ── Revision notes ── */

export interface RevisionNoteRow {
  revision_id: number
  section_plan_id: number
  subject_kind: string
  subject_id: number | null
  change_summary: string
  revised_by: string | null
  revised_at: string
}

const revisionKey = (sectionPlanId: number) =>
  ['section-revisions', sectionPlanId] as const

export function useSectionRevisions(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: revisionKey(sectionPlanId),
    queryFn: async (): Promise<RevisionNoteRow[]> => {
      const { data, error } = await supabase
        .from('section_plan_revision_notes')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('revised_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as RevisionNoteRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useAddRevisionNote() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      subject_kind: string
      subject_id?: number | null
      change_summary: string
    }) => {
      const { data, error } = await supabase
        .from('section_plan_revision_notes')
        .insert({
          section_plan_id: params.section_plan_id,
          subject_kind: params.subject_kind,
          subject_id: params.subject_id ?? null,
          change_summary: params.change_summary,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: revisionKey(vars.section_plan_id) }),
  })
}
