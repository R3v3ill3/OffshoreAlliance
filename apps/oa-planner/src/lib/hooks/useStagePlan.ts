'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CapacityStatus } from '@/types'

export function useStagePlan(campaignId: number, stageNumber: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['stage-plan', campaignId, stageNumber],
    queryFn: async () => {
      const { data: plan, error } = await supabase
        .from('campaign_stage_plans')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('stage_number', stageNumber)
        .single()

      if (error) throw error

      const [ambitions, whereToPlay, theories, capacities, mgmtSystems] = await Promise.all([
        supabase
          .from('plan_ambitions')
          .select('*, ambition_options(option_text, category, has_variable, variable_label, variable_type)')
          .eq('plan_id', plan.plan_id)
          .order('sort_order'),
        supabase
          .from('plan_where_to_play')
          .select('*, wtp_categories(category_name), wtp_options(option_text)')
          .eq('plan_id', plan.plan_id)
          .order('sort_order'),
        supabase
          .from('plan_theory_of_winning')
          .select('*')
          .eq('plan_id', plan.plan_id)
          .order('version', { ascending: false }),
        supabase
          .from('plan_capacities')
          .select('*, capacity_options(option_text, category), organisers(organiser_name)')
          .eq('plan_id', plan.plan_id)
          .order('sort_order'),
        supabase
          .from('plan_management_systems')
          .select('*, management_system_options(option_text, category, default_frequency), organisers(organiser_name)')
          .eq('plan_id', plan.plan_id)
          .order('sort_order'),
      ])

      return {
        plan,
        ambitions: ambitions.data || [],
        whereToPlay: whereToPlay.data || [],
        theories: theories.data || [],
        capacities: capacities.data || [],
        managementSystems: mgmtSystems.data || [],
        currentTheory: theories.data?.find((t) => t.is_current) || null,
      }
    },
    enabled: !!campaignId && !!stageNumber,
  })
}

export function useAddAmbition() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      plan_id: number
      ambition_option_id?: number
      custom_text?: string
      target_value?: string
      target_unit?: string
      target_date?: string
      sort_order?: number
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, ...insertData } = params
      const { data, error } = await supabase
        .from('plan_ambitions')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error

      // Increment use_count on the option (non-critical)
      if (params.ambition_option_id) {
        supabase
          .from('ambition_options')
          .select('use_count')
          .eq('option_id', params.ambition_option_id)
          .single()
          .then(({ data: opt }) => {
            if (opt) {
              supabase
                .from('ambition_options')
                .update({ use_count: (opt.use_count ?? 0) + 1 })
                .eq('option_id', params.ambition_option_id!)
                .then(() => {})
            }
          })
      }

      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useUpdateAmbition() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      ambition_id: number
      target_value?: string
      target_unit?: string
      target_date?: string | null
      is_achieved?: boolean
      achieved_date?: string | null
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, ambition_id, ...updates } = params
      const { error } = await supabase
        .from('plan_ambitions')
        .update(updates)
        .eq('ambition_id', ambition_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useDeleteAmbition() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { ambition_id: number; campaign_id: number; stage_number: number }) => {
      const { error } = await supabase
        .from('plan_ambitions')
        .delete()
        .eq('ambition_id', params.ambition_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useAddWhereToPlay() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      plan_id: number
      wtp_category_id: number
      wtp_option_id?: number
      custom_text?: string
      rationale?: string
      is_exclusion?: boolean
      priority?: number
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, ...insertData } = params
      const { data, error } = await supabase
        .from('plan_where_to_play')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useUpdateWhereToPlay() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      wtp_id: number
      rationale?: string
      is_exclusion?: boolean
      priority?: number
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, wtp_id, ...updates } = params
      const { error } = await supabase
        .from('plan_where_to_play')
        .update(updates)
        .eq('wtp_id', wtp_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useDeleteWhereToPlay() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { wtp_id: number; campaign_id: number; stage_number: number }) => {
      const { error } = await supabase
        .from('plan_where_to_play')
        .delete()
        .eq('wtp_id', params.wtp_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useAddCapacity() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      plan_id: number
      capacity_option_id?: number
      custom_text?: string
      status: CapacityStatus
      assigned_to?: number
      gap_description?: string
      resolution_plan?: string
      resolution_date?: string
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, ...insertData } = params
      const { data, error } = await supabase
        .from('plan_capacities')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useUpdateCapacity() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      capacity_id: number
      status?: CapacityStatus
      assigned_to?: number | null
      gap_description?: string
      resolution_plan?: string
      resolution_date?: string | null
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, capacity_id, ...updates } = params
      const { error } = await supabase
        .from('plan_capacities')
        .update(updates)
        .eq('capacity_id', capacity_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useAddManagementSystem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      plan_id: number
      system_option_id?: number
      custom_text?: string
      frequency?: string
      responsible_organiser_id?: number
      description?: string
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, ...insertData } = params
      const { data, error } = await supabase
        .from('plan_management_systems')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}

export function useSaveTheory() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      plan_id: number
      if_then_statement: string
      ai_generated: boolean
      ai_model?: string
      ai_prompt_snapshot?: object
      gap_analysis?: Record<string, unknown>
      risk_assessment?: Record<string, unknown>
      member_agency_assessment?: string
      employer_response_plan?: string
      campaign_id: number
      stage_number: number
    }) => {
      const { campaign_id: _campaign_id, stage_number: _stage_number, plan_id, ...theoryData } = params

      // Mark existing theories as not current
      await supabase
        .from('plan_theory_of_winning')
        .update({ is_current: false })
        .eq('plan_id', plan_id)

      // Get next version number
      const { data: existing } = await supabase
        .from('plan_theory_of_winning')
        .select('version')
        .eq('plan_id', plan_id)
        .order('version', { ascending: false })
        .limit(1)

      const nextVersion = (existing?.[0]?.version || 0) + 1

      const { data, error } = await supabase
        .from('plan_theory_of_winning')
        .insert({
          plan_id,
          if_then_statement: theoryData.if_then_statement,
          ai_generated: theoryData.ai_generated,
          ai_model: theoryData.ai_model ?? null,
          member_agency_assessment: theoryData.member_agency_assessment ?? null,
          employer_response_plan: theoryData.employer_response_plan ?? null,
          gap_analysis: null,
          risk_assessment: null,
          is_current: true,
          version: nextVersion,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
    },
  })
}
