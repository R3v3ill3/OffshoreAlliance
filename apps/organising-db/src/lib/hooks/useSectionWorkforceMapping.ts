'use client'

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

export interface WorkforceMappingRow {
  worksite_ou_id: number
  worksite_name: string
  total_workers_estimated: number | null
  workers_count: number
  members_count: number
  density_pct: number | null
  non_member_count: number
  unrated_count: number
  // Filled in by the merge with overrides:
  workers_effective: number
  members_effective: number
  density_effective: number | null
  override_note: string | null
  has_override: boolean
}

export interface WorkforceMappingOverride {
  override_id: number
  section_plan_id: number
  worksite_ou_id: number
  workers_override: number | null
  members_override: number | null
  density_override: number | null
  note: string | null
  updated_at: string
}

const mappingKey = (sectionPlanId: number, campaignId: number) =>
  ['section-workforce-mapping', sectionPlanId, campaignId] as const

const overridesKey = (sectionPlanId: number) =>
  ['section-workforce-overrides', sectionPlanId] as const

/**
 * Fetches the live `v_section_plan_workforce_mapping` rows for the section's
 * campaign and merges any per-section overrides on top, exposing
 * `*_effective` fields that the UI should bind to.
 */
export function useSectionWorkforceMapping(
  sectionPlanId: number,
  campaignId: number,
) {
  const supabase = createClient()

  const baseQuery = useQuery({
    queryKey: mappingKey(sectionPlanId, campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_section_plan_workforce_mapping')
        .select('*')
        .eq('campaign_id', campaignId)
      if (error) throw error
      return (data ?? []) as Array<{
        worksite_ou_id: number
        worksite_name: string
        total_workers_estimated: number | null
        workers_count: number
        members_count: number
        density_pct: number | null
        non_member_count: number
        unrated_count: number
      }>
    },
    enabled: Number.isFinite(campaignId) && campaignId > 0,
  })

  const overridesQuery = useQuery({
    queryKey: overridesKey(sectionPlanId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('section_plan_workforce_mapping_overrides')
        .select('*')
        .eq('section_plan_id', sectionPlanId)
      if (error) throw error
      return (data ?? []) as unknown as WorkforceMappingOverride[]
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })

  const rows = useMemo<WorkforceMappingRow[]>(() => {
    const overridesByOu = new Map<number, WorkforceMappingOverride>()
    for (const o of overridesQuery.data ?? []) overridesByOu.set(o.worksite_ou_id, o)

    return (baseQuery.data ?? [])
      .map((row) => {
        const o = overridesByOu.get(row.worksite_ou_id)
        const workers = o?.workers_override ?? row.workers_count
        const members = o?.members_override ?? row.members_count
        const density =
          o?.density_override ??
          (workers > 0 && members != null ? Math.round((1000 * members) / workers) / 10 : row.density_pct)
        return {
          ...row,
          workers_effective: workers,
          members_effective: members,
          density_effective: density,
          override_note: o?.note ?? null,
          has_override: !!o,
        }
      })
      .sort((a, b) => a.worksite_name.localeCompare(b.worksite_name))
  }, [baseQuery.data, overridesQuery.data])

  return {
    rows,
    isLoading: baseQuery.isLoading || overridesQuery.isLoading,
    isFetching: baseQuery.isFetching || overridesQuery.isFetching,
    error: baseQuery.error ?? overridesQuery.error,
    refetch: () => {
      baseQuery.refetch()
      overridesQuery.refetch()
    },
  }
}

export function useUpsertWorkforceOverride() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      worksite_ou_id: number
      workers_override?: number | null
      members_override?: number | null
      density_override?: number | null
      note?: string | null
    }) => {
      const { data, error } = await supabase
        .from('section_plan_workforce_mapping_overrides')
        .upsert(
          {
            section_plan_id: params.section_plan_id,
            worksite_ou_id: params.worksite_ou_id,
            workers_override: params.workers_override ?? null,
            members_override: params.members_override ?? null,
            density_override: params.density_override ?? null,
            note: params.note ?? null,
          },
          { onConflict: 'section_plan_id,worksite_ou_id' },
        )
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as WorkforceMappingOverride
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: overridesKey(vars.section_plan_id) })
    },
  })
}

export function useDeleteWorkforceOverride() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      worksite_ou_id: number
    }) => {
      const { error } = await supabase
        .from('section_plan_workforce_mapping_overrides')
        .delete()
        .eq('section_plan_id', params.section_plan_id)
        .eq('worksite_ou_id', params.worksite_ou_id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: overridesKey(vars.section_plan_id) })
    },
  })
}
