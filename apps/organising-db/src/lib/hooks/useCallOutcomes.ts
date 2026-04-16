import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CallOutcomeDefinition,
  OutcomeCategory,
  OutcomeResponseType,
  OutcomeSideEffect,
} from '@/types/planner-types'

/** Coerce to values allowed by `call_outcome_definitions_side_effect_check` (handles legacy AI/DB strings). */
export function normalizeOutcomeSideEffectForDb(value: unknown): 'none' | 'set_membership_pending' {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (s === 'set_membership_pending' || s === 'set_membership_financial') {
    return 'set_membership_pending'
  }
  if (s === 'none' || s === '') return 'none'
  return 'none'
}

/** Script family rule: outcome definitions are stored on the base script (matches `resolve_outcomes_script_id` in SQL). */
export async function resolveOutcomesScriptId(
  supabase: SupabaseClient,
  scriptId: number
): Promise<number> {
  const { data: scriptRow, error: scriptErr } = await supabase
    .from('call_scripts')
    .select('base_script_id')
    .eq('script_id', scriptId)
    .maybeSingle()

  if (scriptErr) throw scriptErr
  return scriptRow?.base_script_id != null ? scriptRow.base_script_id : scriptId
}

export function useCallOutcomeDefinitions(scriptId: number | string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['call-outcome-definitions', String(scriptId)],
    queryFn: async () => {
      const sid = parseInt(String(scriptId), 10)
      const effectiveId = await resolveOutcomesScriptId(supabase, sid)

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
  const contextScriptId = parseInt(String(scriptId), 10)

  return useMutation({
    mutationFn: async (input: SaveCallOutcomesInput) => {
      const effectiveScriptId = await resolveOutcomesScriptId(supabase, contextScriptId)
      let activityId: number | null = null

      if (cid != null) {
        const { data: existingActivity } = await supabase
          .from('call_outcome_definitions')
          .select('activity_id')
          .eq('script_id', effectiveScriptId)
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
              title: `Phone Campaign — ${input.scriptTitle || `Script #${effectiveScriptId}`}`,
              activity_kind: 'assessment',
              is_binary: false,
              is_custom: true,
            })
            .select('activity_id')
            .single()

          if (actErr) {
            const parts = [actErr.message, actErr.details, actErr.hint].filter(Boolean)
            throw new Error(parts.length ? parts.join(' — ') : 'Failed to create campaign activity for outcomes')
          }
          activityId = newActivity.activity_id
        }
      }

      const { error: delErr } =
        cid != null
          ? await supabase
              .from('call_outcome_definitions')
              .delete()
              .eq('script_id', effectiveScriptId)
              .eq('campaign_id', cid)
          : await supabase
              .from('call_outcome_definitions')
              .delete()
              .eq('script_id', effectiveScriptId)
              .is('campaign_id', null)
      if (delErr) {
        const parts = [delErr.message, delErr.details, delErr.hint].filter(Boolean)
        throw new Error(parts.length ? parts.join(' — ') : 'Failed to clear existing outcomes')
      }

      if (input.outcomes.length > 0) {
        const rows = input.outcomes.map((o, i) => ({
          campaign_id: cid,
          script_id: effectiveScriptId,
          name: o.name,
          description: o.description || null,
          outcome_category: o.outcome_category,
          maps_to_ambition_id: o.maps_to_ambition_id || null,
          is_positive: o.is_positive,
          sort_order: i,
          activity_id: activityId,
          response_type: o.response_type || 'checkbox',
          response_options: o.response_options || null,
          side_effect: normalizeOutcomeSideEffectForDb(o.side_effect),
          side_effect_payload: o.side_effect_payload || null,
        }))

        const { error: insertErr } = await supabase.from('call_outcome_definitions').insert(rows)

        if (insertErr) {
          const parts = [insertErr.message, insertErr.details, insertErr.hint].filter(Boolean)
          throw new Error(parts.length ? parts.join(' — ') : 'Failed to save outcomes')
        }
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
