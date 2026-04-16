import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type {
  CallOutcomeDefinition,
  OutcomeCategory,
  OutcomeResponseType,
  OutcomeSideEffect,
} from '@/types/planner-types'

export function useCallOutcomeDefinitions(scriptId: number | string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['call-outcome-definitions', String(scriptId)],
    queryFn: async () => {
      const sid = parseInt(String(scriptId), 10)
      const { data: scriptRow, error: scriptErr } = await supabase
        .from('call_scripts')
        .select('base_script_id')
        .eq('script_id', sid)
        .maybeSingle()

      if (scriptErr) throw scriptErr

      const effectiveId =
        scriptRow?.base_script_id != null ? scriptRow.base_script_id : sid

      const { data, error } = await supabase
        .from('call_outcome_definitions')
        .select('*')
        .eq('script_id', effectiveId)
        .order('sort_order')

      if (error) throw error
      return (data ?? []).map((row) => {
        const raw = row.side_effect as string | null
        const side_effect: OutcomeSideEffect =
          raw === 'set_membership_financial' || raw === 'set_membership_pending'
            ? 'set_membership_pending'
            : 'none'
        return {
          ...row,
          side_effect,
          side_effect_payload: row.side_effect_payload as Record<string, unknown> | null,
        }
      }) as CallOutcomeDefinition[]
    },
    enabled: !!scriptId,
  })
}

export function useCallOutcomeDefinitionsByCampaign(campaignId: number | string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['call-outcome-definitions-campaign', String(campaignId)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_outcome_definitions')
        .select('*')
        .eq('campaign_id', parseInt(String(campaignId)))
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as CallOutcomeDefinition[]
    },
    enabled: !!campaignId,
  })
}

export interface SaveCallOutcomesInput {
  outcomes: {
    outcome_id?: number
    name: string
    description?: string | null
    outcome_category: OutcomeCategory
    maps_to_ambition_id?: number | null
    is_positive: boolean
    sort_order: number
    response_type?: OutcomeResponseType
    response_options?: { value: string; label: string }[] | null
    side_effect?: OutcomeSideEffect
    side_effect_payload?: Record<string, unknown> | null
  }[]
  scriptTitle?: string
}

export function useSaveCallOutcomes(campaignId: number | string | null, scriptId: number | string) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cid = campaignId != null && campaignId !== '' ? parseInt(String(campaignId), 10) : null
  const sid = parseInt(String(scriptId), 10)

  return useMutation({
    mutationFn: async (input: SaveCallOutcomesInput) => {
      let activityId: number | null = null

      if (cid != null) {
        const { data: existingActivity } = await supabase
          .from('call_outcome_definitions')
          .select('activity_id')
          .eq('script_id', sid)
          .eq('campaign_id', cid)
          .not('activity_id', 'is', null)
          .limit(1)
          .maybeSingle()

        if (existingActivity?.activity_id) {
          activityId = existingActivity.activity_id
        } else {
          const { data: newActivity, error: actErr } = await supabase
            .from('campaign_activities')
            .insert({
              campaign_id: cid,
              title: `Phone Campaign — ${input.scriptTitle || `Script #${sid}`}`,
              activity_kind: 'assessment',
              is_binary: false,
              is_custom: true,
            })
            .select('activity_id')
            .single()

          if (actErr) throw actErr
          activityId = newActivity.activity_id
        }
      }

      const { error: delErr } =
        cid != null
          ? await supabase
              .from('call_outcome_definitions')
              .delete()
              .eq('script_id', sid)
              .eq('campaign_id', cid)
          : await supabase
              .from('call_outcome_definitions')
              .delete()
              .eq('script_id', sid)
              .is('campaign_id', null)
      if (delErr) throw delErr

      if (input.outcomes.length > 0) {
        const rows = input.outcomes.map((o, i) => ({
          campaign_id: cid,
          script_id: sid,
          name: o.name,
          description: o.description || null,
          outcome_category: o.outcome_category,
          maps_to_ambition_id: o.maps_to_ambition_id || null,
          is_positive: o.is_positive,
          sort_order: i,
          activity_id: activityId,
          response_type: o.response_type || 'checkbox',
          response_options: o.response_options || null,
          side_effect: o.side_effect || 'none',
          side_effect_payload: o.side_effect_payload || null,
        }))

        const { error: insertErr } = await supabase.from('call_outcome_definitions').insert(rows)

        if (insertErr) throw insertErr
      }

      return { activityId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-outcome-definitions'] })
      if (cid != null) {
        queryClient.invalidateQueries({ queryKey: ['call-outcome-definitions-campaign', String(cid)] })
      }
    },
  })
}
