'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import type {
  CreateSectionPlanInput,
  SectionPlanRow,
  SectionPlanStatus,
  UpdateSectionPlanInput,
} from '@/types/section-planning'

const sectionPlansKey = (campaignId: number) => ['section-plans', campaignId] as const
const sectionPlanKey = (sectionPlanId: number) => ['section-plan', sectionPlanId] as const

/**
 * Lists section plans for one campaign. By default returns non-archived rows
 * ordered by `start_date DESC`. Pass `includeArchived` to surface archived rows
 * for an admin / history view.
 */
export function useSectionPlans(
  campaignId: number,
  options?: { includeArchived?: boolean },
) {
  const supabase = createClient()
  const includeArchived = options?.includeArchived ?? false

  return useQuery({
    queryKey: [...sectionPlansKey(campaignId), { includeArchived }],
    queryFn: async (): Promise<SectionPlanRow[]> => {
      let query = supabase
        .from('section_plans')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('start_date', { ascending: false })

      if (!includeArchived) {
        query = query.neq('status', 'archived')
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as SectionPlanRow[]
    },
    enabled: Number.isFinite(campaignId) && campaignId > 0,
  })
}

/** Fetches a single section plan by id. */
export function useSectionPlan(sectionPlanId: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: sectionPlanKey(sectionPlanId),
    queryFn: async (): Promise<SectionPlanRow | null> => {
      const { data, error } = await supabase
        .from('section_plans')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as SectionPlanRow | null) ?? null
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useCreateSectionPlan() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (input: CreateSectionPlanInput): Promise<SectionPlanRow> => {
      const { data, error } = await supabase
        .from('section_plans')
        .insert({
          campaign_id: input.campaign_id,
          name: input.name,
          purpose: input.purpose ?? null,
          start_date: input.start_date,
          end_date: input.end_date,
          timeframe_kind: input.timeframe_kind ?? 'user_set',
          external_anchor_label: input.external_anchor_label ?? null,
          status: input.status ?? 'active',
        })
        .select('*')
        .single()

      if (error) throw error
      return data as unknown as SectionPlanRow
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: sectionPlansKey(variables.campaign_id) })
    },
  })
}

export function useUpdateSectionPlan() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (input: UpdateSectionPlanInput): Promise<SectionPlanRow> => {
      const { section_plan_id, status, ...rest } = input
      const updates: Record<string, unknown> = { ...rest }

      // Keep archived_at consistent with status — the DB CHECK will reject
      // mismatches but the UI should set this proactively rather than rely on
      // a server round-trip to discover the constraint failure.
      if (status !== undefined) {
        updates.status = status
        updates.archived_at = status === 'archived' ? new Date().toISOString() : null
      }

      const { data, error } = await supabase
        .from('section_plans')
        .update(updates)
        .eq('section_plan_id', section_plan_id)
        .select('*')
        .single()

      if (error) throw error
      return data as unknown as SectionPlanRow
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sectionPlansKey(data.campaign_id) })
      queryClient.invalidateQueries({ queryKey: sectionPlanKey(data.section_plan_id) })
    },
  })
}

/** Convenience wrapper: archive without filling the form yourself. */
export function useArchiveSectionPlan() {
  const update = useUpdateSectionPlan()
  return {
    ...update,
    mutate: (vars: { section_plan_id: number }) =>
      update.mutate({
        section_plan_id: vars.section_plan_id,
        status: 'archived' as SectionPlanStatus,
      }),
    mutateAsync: (vars: { section_plan_id: number }) =>
      update.mutateAsync({
        section_plan_id: vars.section_plan_id,
        status: 'archived' as SectionPlanStatus,
      }),
  }
}

export function useDeleteSectionPlan() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: { section_plan_id: number; campaign_id: number }) => {
      const { error } = await supabase
        .from('section_plans')
        .delete()
        .eq('section_plan_id', params.section_plan_id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: sectionPlansKey(variables.campaign_id) })
      queryClient.removeQueries({ queryKey: sectionPlanKey(variables.section_plan_id) })
    },
  })
}
