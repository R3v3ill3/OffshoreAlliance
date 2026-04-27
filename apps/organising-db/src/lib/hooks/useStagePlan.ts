'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import type { CapacityStatus } from '@/types/planner-types'

export function useStagePlan(campaignId: number, stageNumber: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['stage-plan', campaignId, stageNumber],
    queryFn: async () => {
      // Use maybeSingle() so a missing stage plan (PGRST116) is returned as
      // null rather than thrown. The page component is responsible for
      // handling null by triggering the auto-heal flow
      // (useInitializeCampaignStagePlans).
      const { data: plan, error } = await supabase
        .from('campaign_stage_plans')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('stage_number', stageNumber)
        .maybeSingle()

      if (error) throw error

      if (!plan) {
        // No stage plan exists yet for this (campaign, stage). Return an
        // empty shape so the page can show an initializing state and trigger
        // the auto-heal mutation without tripping downstream queries that
        // depend on plan.plan_id.
        return {
          plan: null,
          ambitions: [],
          whereToPlay: [],
          theories: [],
          capacities: [],
          managementSystems: [],
          currentTheory: null,
        }
      }

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

      const firstError = ambitions.error || whereToPlay.error || theories.error || capacities.error || mgmtSystems.error
      if (firstError) throw firstError

      return {
        plan,
        ambitions: ambitions.data ?? [],
        whereToPlay: whereToPlay.data ?? [],
        theories: theories.data ?? [],
        capacities: capacities.data ?? [],
        managementSystems: mgmtSystems.data ?? [],
        currentTheory: theories.data?.find((t) => t.is_current) ?? null,
      }
    },
    enabled: !!campaignId && !!stageNumber,
  })
}

/**
 * Canonical stage names used by the campaign wizard when creating a new
 * campaign. Kept in sync with useCreateCampaign / useAddPlanToCampaign in
 * usePlannerCampaigns.ts so auto-heal produces identical stage plans.
 */
const STAGE_NAMES_FOR_INIT = [
  'Contact ID & Mapping',
  'Intro Comms & Education',
  'Member Mobilisation',
  'Develop Claims / MSD',
  'Endorsement & Commence Bargaining',
  'Bargaining to Win',
] as const

/**
 * Auto-heal mutation: creates the 6 canonical campaign_stage_plans rows for a
 * campaign that is missing them. Safe to run repeatedly — uses upsert with
 * ignoreDuplicates so existing rows are left untouched. Also seeds the same
 * default "Expected new members" / "Membership density" ambitions the wizard
 * normally creates, and backfills gate_definitions (5 gates) if missing.
 *
 * Triggered from the stage page when useStagePlan returns plan === null.
 * Requires admin or lead-organiser role per RLS (0015_planning_rls_policies.sql);
 * other users will see a permission error and fall through to the "Stage plan
 * not found" fallback UI.
 */
export function useInitializeCampaignStagePlans() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: { campaign_id: number }) => {
      const { campaign_id } = params

      // 1. Upsert the 6 stage plans.
      const stagePlans = STAGE_NAMES_FOR_INIT.map((name, i) => ({
        campaign_id,
        stage_number: i + 1,
        stage_name: name,
        status: i === 0 ? 'active' : 'draft',
      }))

      const { error: plansError } = await supabase
        .from('campaign_stage_plans')
        .upsert(stagePlans, { onConflict: 'campaign_id,stage_number', ignoreDuplicates: true })

      if (plansError) throw plansError

      // 2. Read back the plans so we have plan_ids for the ambitions seed.
      const { data: insertedPlans, error: plansSelectError } = await supabase
        .from('campaign_stage_plans')
        .select('plan_id, stage_number, planned_end_date')
        .eq('campaign_id', campaign_id)
        .order('stage_number')

      if (plansSelectError) throw plansSelectError

      // 3. Seed default membership ambitions for any plan that has none.
      //    We check existing ambitions first so we don't duplicate rows if
      //    some stages were partially seeded.
      const planIds = (insertedPlans ?? []).map((p) => p.plan_id)
      if (planIds.length > 0) {
        const { data: existingAmbitions, error: ambSelectError } = await supabase
          .from('plan_ambitions')
          .select('plan_id, custom_text, is_system_default')
          .in('plan_id', planIds)
          .eq('is_system_default', true)

        if (ambSelectError) throw ambSelectError

        const existingByPlan = new Map<number, Set<string>>()
        for (const row of existingAmbitions ?? []) {
          const key = row.plan_id as number
          const text = (row.custom_text as string | null) ?? ''
          if (!existingByPlan.has(key)) existingByPlan.set(key, new Set())
          existingByPlan.get(key)!.add(text)
        }

        const ambitionRows: Array<Record<string, unknown>> = []
        for (const p of insertedPlans ?? []) {
          const have = existingByPlan.get(p.plan_id) ?? new Set<string>()
          if (!have.has('Expected new members')) {
            ambitionRows.push({
              plan_id: p.plan_id,
              custom_text: 'Expected new members',
              is_system_default: true,
              metric_type: 'count',
              sort_order: 0,
              target_date: p.planned_end_date,
              target_date_user_overridden: false,
              is_hard_gate: false,
            })
          }
          if (!have.has('Membership density')) {
            ambitionRows.push({
              plan_id: p.plan_id,
              custom_text: 'Membership density',
              is_system_default: true,
              metric_type: 'percentage',
              sort_order: 1,
              target_date: p.planned_end_date,
              target_date_user_overridden: false,
              is_hard_gate: false,
            })
          }
        }

        if (ambitionRows.length > 0) {
          const { error: ambInsertError } = await supabase
            .from('plan_ambitions')
            .insert(ambitionRows)
          if (ambInsertError) throw ambInsertError
        }
      }

      // 4. Backfill missing gate_definitions (5 gates). Since there's no
      //    unique constraint on (campaign_id, gate_number) in the schema
      //    visible to us, we read existing gates first and only insert
      //    those that are missing.
      const { data: existingGates, error: gatesSelectError } = await supabase
        .from('gate_definitions')
        .select('gate_number')
        .eq('campaign_id', campaign_id)

      if (gatesSelectError) throw gatesSelectError

      const haveGateNumbers = new Set((existingGates ?? []).map((g) => g.gate_number as number))
      const GATE_DEFAULTS = [
        { gate_number: 1, gate_name: 'Member Engagement Threshold' },
        { gate_number: 2, gate_name: 'Engagement Ready Assessment' },
        { gate_number: 3, gate_name: 'Log of Claims Survey Participation' },
        { gate_number: 4, gate_name: 'Ready for Bargaining' },
        { gate_number: 5, gate_name: 'Strike Ready' },
      ]
      const missingGates = GATE_DEFAULTS.filter((g) => !haveGateNumbers.has(g.gate_number)).map((g) => ({
        campaign_id,
        gate_number: g.gate_number,
        gate_name: g.gate_name,
        enforcement_type: 'soft',
      }))

      if (missingGates.length > 0) {
        const { error: gatesInsertError } = await supabase
          .from('gate_definitions')
          .insert(missingGates)
        if (gatesInsertError) throw gatesInsertError
      }

      return { campaign_id }
    },
    onSuccess: (_, variables) => {
      // Invalidate everything that could reflect the newly-created plans/gates.
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['gates', variables.campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['campaign-ambitions-by-stage', variables.campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['existing-campaign-for-planning', variables.campaign_id] })
    },
  })
}

export function useAddAmbition() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: {
      plan_id: number
      ambition_option_id?: number
      custom_text?: string
      target_value?: string
      target_value_max?: string
      target_unit?: string
      target_date?: string
      metric_type?: string
      is_system_default?: boolean
      is_hard_gate?: boolean
      target_date_user_overridden?: boolean
      sort_order?: number
      /**
       * 'campaign_setup' = non-worker tracking (lists, unit id, timelines).
       * 'worker_assessable' = rolled up from campaign_activity_ratings.
       * Defaults server-side to 'worker_assessable' if omitted.
       */
      ambition_scope?: import('@/types/planner-types').AmbitionScope
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
      queryClient.invalidateQueries({
        queryKey: ['gate-ambitions', variables.campaign_id, variables.stage_number],
      })
      queryClient.invalidateQueries({
        queryKey: ['campaign-ambitions-by-stage', variables.campaign_id],
      })
    },
  })
}

export function useUpdateAmbition() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: {
      ambition_id: number
      target_value?: string
      target_value_max?: string | null
      target_unit?: string
      target_date?: string | null
      target_date_user_overridden?: boolean
      is_achieved?: boolean
      achieved_date?: string | null
      is_hard_gate?: boolean
      metric_type?: string | null
      current_value?: string | null
      evidence_notes?: string | null
      ambition_scope?: import('@/types/planner-types').AmbitionScope
      /** Phase 3: optional FK to a campaign-level ambition for rollup. */
      parent_campaign_ambition_id?: number | null
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
      queryClient.invalidateQueries({
        queryKey: ['gate-ambitions', variables.campaign_id, variables.stage_number],
      })
      queryClient.invalidateQueries({
        queryKey: ['campaign-ambitions-by-stage', variables.campaign_id],
      })
    },
  })
}

/** Phase 3: list a campaign's campaign-level ambitions for the parent picker in AmbitionPanel. */
export function useCampaignAmbitions(campaignId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['campaign-level-ambitions', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_ambitions')
        .select('campaign_ambition_id, category, subcategory, label')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as Array<{
        campaign_ambition_id: number
        category: 'membership' | 'member_leaders' | 'activism' | 'industrial_outcomes'
        subcategory: string | null
        label: string
      }>
    },
    enabled: !!campaignId,
  })
}

export function useDeleteAmbition() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: { ambition_id: number; campaign_id: number; stage_number: number }) => {
      const { error } = await supabase
        .from('plan_ambitions')
        .delete()
        .eq('ambition_id', params.ambition_id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-plan', variables.campaign_id, variables.stage_number] })
      queryClient.invalidateQueries({
        queryKey: ['gate-ambitions', variables.campaign_id, variables.stage_number],
      })
      queryClient.invalidateQueries({
        queryKey: ['campaign-ambitions-by-stage', variables.campaign_id],
      })
    },
  })
}

export function useAddWhereToPlay() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: {
      plan_id: number
      wtp_category_id: number
      wtp_option_id?: number
      custom_text?: string
      rationale?: string
      is_exclusion?: boolean
      priority?: number
      /** Phase 8: optional FK linking this W2P choice to a stage ambition. */
      linked_ambition_id?: number | null
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

  return useAuthAwareMutation({
    mutationFn: async (params: {
      wtp_id: number
      rationale?: string
      is_exclusion?: boolean
      priority?: number
      /** Phase 8: optional FK linking this W2P choice to a stage ambition. */
      linked_ambition_id?: number | null
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

  return useAuthAwareMutation({
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

  return useAuthAwareMutation({
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

  return useAuthAwareMutation({
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

  return useAuthAwareMutation({
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

  return useAuthAwareMutation({
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
