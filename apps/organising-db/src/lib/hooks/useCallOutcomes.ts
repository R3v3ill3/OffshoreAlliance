import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CallOutcomeDefinition, OutcomeCategory } from '@/types/planner-types'

export function useCallOutcomeDefinitions(scriptId: number | string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['call-outcome-definitions', String(scriptId)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_outcome_definitions')
        .select('*')
        .eq('script_id', parseInt(String(scriptId)))
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as CallOutcomeDefinition[]
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
  }[]
  scriptTitle?: string
}

export function useSaveCallOutcomes(campaignId: number | string, scriptId: number | string) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const cid = parseInt(String(campaignId))
  const sid = parseInt(String(scriptId))

  return useMutation({
    mutationFn: async (input: SaveCallOutcomesInput) => {
      // Ensure a campaign_activities row exists for this script
      let activityId: number | null = null

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

      // Delete existing definitions for this script, then insert fresh
      await supabase
        .from('call_outcome_definitions')
        .delete()
        .eq('script_id', sid)
        .eq('campaign_id', cid)

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
        }))

        const { error: insertErr } = await supabase
          .from('call_outcome_definitions')
          .insert(rows)

        if (insertErr) throw insertErr
      }

      return { activityId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-outcome-definitions', String(sid)] })
      queryClient.invalidateQueries({ queryKey: ['call-outcome-definitions-campaign', String(cid)] })
    },
  })
}
