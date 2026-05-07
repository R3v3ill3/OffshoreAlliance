'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

/* ─────────── Theory of Winning ─────────── */

export interface SectionTheoryRow {
  theory_id: number
  section_plan_id: number
  if_then_statement: string
  ai_generated: boolean | null
  ai_model: string | null
  gap_analysis: Record<string, unknown> | null
  risk_assessment: Record<string, unknown> | null
  member_agency_assessment: string | null
  employer_response_plan: string | null
  is_current: boolean | null
  version: number | null
  created_at: string | null
  updated_at: string | null
}

const theoryKey = (sectionPlanId: number) =>
  ['section-theory', sectionPlanId] as const

export function useSectionTheory(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: theoryKey(sectionPlanId),
    queryFn: async (): Promise<SectionTheoryRow | null> => {
      const { data, error } = await supabase
        .from('plan_theory_of_winning')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('version', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as SectionTheoryRow | null) ?? null
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useSaveSectionTheory() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      if_then_statement: string
      member_agency_assessment?: string | null
      employer_response_plan?: string | null
      ai_generated?: boolean
      ai_model?: string | null
      ai_prompt_snapshot?: Record<string, unknown> | null
      gap_analysis?: Record<string, unknown> | null
      risk_assessment?: Record<string, unknown> | null
    }) => {
      // Mark prior current versions as not-current
      await supabase
        .from('plan_theory_of_winning')
        .update({ is_current: false })
        .eq('section_plan_id', params.section_plan_id)

      const { data: existing } = await supabase
        .from('plan_theory_of_winning')
        .select('version')
        .eq('section_plan_id', params.section_plan_id)
        .order('version', { ascending: false })
        .limit(1)
      const nextVersion = ((existing?.[0]?.version as number | undefined) ?? 0) + 1

      const { data, error } = await supabase
        .from('plan_theory_of_winning')
        .insert({
          section_plan_id: params.section_plan_id,
          plan_id: null,
          if_then_statement: params.if_then_statement,
          ai_generated: params.ai_generated ?? false,
          ai_model: params.ai_model ?? null,
          ai_prompt_snapshot: params.ai_prompt_snapshot ?? null,
          gap_analysis: params.gap_analysis ?? null,
          risk_assessment: params.risk_assessment ?? null,
          member_agency_assessment: params.member_agency_assessment ?? null,
          employer_response_plan: params.employer_response_plan ?? null,
          is_current: true,
          version: nextVersion,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as SectionTheoryRow
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: theoryKey(vars.section_plan_id) })
    },
  })
}

/* ─────────── SOCs ─────────── */

export type SocKind = 'members_general' | 'bargaining_reps'

export interface SectionSocRow {
  soc_id: number
  section_plan_id: number
  soc_kind: SocKind
  name: string
  step_1_introduction: string | null
  step_2_agitation_or_briefing: string | null
  step_3_hope_or_walkthrough: string | null
  step_4_call_to_action_or_hope: string | null
  step_5_mapping_or_clear_ask: string | null
  step_6_industrial_or_pabo: string | null
  step_7_inoculation_or_close: string | null
  industrial_in_scope: boolean
  pabo_in_scope: boolean
  ai_generated: boolean
  ai_model: string | null
  created_at: string
  updated_at: string
}

const socsKey = (sectionPlanId: number) => ['section-socs', sectionPlanId] as const

export function useSectionSocs(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: socsKey(sectionPlanId),
    queryFn: async (): Promise<SectionSocRow[]> => {
      const { data, error } = await supabase
        .from('section_plan_socs')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .order('soc_kind')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as SectionSocRow[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useUpsertSectionSoc() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: Partial<SectionSocRow> & {
      section_plan_id: number
      soc_kind: SocKind
      name: string
    }) => {
      const { soc_id, ...rest } = params
      if (soc_id) {
        const { data, error } = await supabase
          .from('section_plan_socs')
          .update(rest)
          .eq('soc_id', soc_id)
          .select('*')
          .single()
        if (error) throw error
        return data as unknown as SectionSocRow
      }
      const { data, error } = await supabase
        .from('section_plan_socs')
        .insert(rest)
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as SectionSocRow
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: socsKey(vars.section_plan_id) }),
  })
}

export function useDeleteSectionSoc() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: { soc_id: number; section_plan_id: number }) => {
      const { error } = await supabase
        .from('section_plan_socs')
        .delete()
        .eq('soc_id', params.soc_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: socsKey(vars.section_plan_id) }),
  })
}

/* ─────────── Recording grid ─────────── */

export interface SocRecordingGridRow {
  soc_id: number
  section_plan_id: number
  campaign_id: number
  soc_kind: SocKind
  soc_name: string
  worker_id: number
  worker_name: string
  member_role_type_id: number | null
  current_rating: number | null
  no_vote_rating: number | null
  pabo_rating: number | null
  member_status_confirmed: string | null
  notes: string | null
  recorded_at: string | null
  activity_event_id: number | null
}

const gridKey = (socId: number) => ['soc-recording-grid', socId] as const

export function useSocRecordingGrid(socId: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: gridKey(socId ?? 0),
    queryFn: async (): Promise<SocRecordingGridRow[]> => {
      if (!socId) return []
      const { data, error } = await supabase
        .from('v_section_plan_soc_recording_grid')
        .select('*')
        .eq('soc_id', socId)
        .order('worker_name')
      if (error) throw error
      return (data ?? []) as unknown as SocRecordingGridRow[]
    },
    enabled: !!socId,
  })
}

export function useUpsertSocRecording() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      soc_id: number
      worker_id: number
      activity_event_id?: number | null
      no_vote_rating?: number | null
      pabo_rating?: number | null
      member_status_confirmed?: string | null
      notes?: string | null
    }) => {
      const onConflict = params.activity_event_id
        ? 'soc_id,activity_event_id,worker_id'
        : 'soc_id,worker_id'
      const { data, error } = await supabase
        .from('section_plan_soc_recordings')
        .upsert(
          {
            soc_id: params.soc_id,
            worker_id: params.worker_id,
            activity_event_id: params.activity_event_id ?? null,
            no_vote_rating: params.no_vote_rating ?? null,
            pabo_rating: params.pabo_rating ?? null,
            member_status_confirmed: params.member_status_confirmed ?? null,
            notes: params.notes ?? null,
          },
          { onConflict },
        )
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: gridKey(vars.soc_id) }),
  })
}
