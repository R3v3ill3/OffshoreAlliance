'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation, ensureValidSession } from '@/lib/hooks/useAuthAwareMutation'
import { syncAmbitionTargetDatesForCampaign } from '@/lib/supabase/syncAmbitionTargetDates'
import { logConnectionEvent, generateTraceId } from '@/lib/supabase/connection-monitor'
import { fetchApi } from '@/lib/api/fetch-api'

/** Stage row from the creation wizard → persisted on campaign_stage_plans */
export type PlannerStageDateInput = {
  stage_number: number
  planned_start: string
  planned_end: string
  duration_weeks: number
  plan_status?: 'completed' | 'active' | 'draft' | 'blocked'
  actual_start?: string | null
  actual_end?: string | null
}

export function useCampaigns() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          organisers(organiser_name, email),
          campaign_stage_plans(plan_id, stage_number, stage_name, status),
          campaign_timelines(
            timeline_id,
            agreement_expiry_date,
            pabo_available_date,
            working_backwards,
            agreements(agreement_name, short_name)
          ),
          gate_definitions(gate_id, gate_number, gate_name, enforcement_type)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
  })
}

export function useCampaign(id: number, options?: { enabled?: boolean }) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      // Use maybeSingle() so a missing campaign returns null instead of
      // throwing PGRST116. Callers already handle `!campaign` cases.
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          organisers(organiser_name, email, phone),
          campaign_stage_plans(
            plan_id, stage_number, stage_name, status,
            planned_start_date, planned_end_date,
            actual_start_date, actual_end_date
          ),
          campaign_timelines(
            *,
            agreements(agreement_name, short_name, expiry_date, status, is_greenfield),
            stage_timeline_targets(*)
          ),
          gate_definitions(
            *,
            gate_criteria(*)
          )
        `)
        .eq('campaign_id', id)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: options?.enabled !== undefined ? options.enabled && id > 0 : !!id && id > 0,
  })
}

export function useUpdateCampaignStagePlans() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (payload: {
      campaign_id: number
      updates: Array<{
        plan_id: number
        planned_start_date: string | null
        planned_end_date: string | null
      }>
    }) => {
      const now = new Date().toISOString()
      for (const u of payload.updates) {
        const { error } = await supabase
          .from('campaign_stage_plans')
          .update({
            planned_start_date: u.planned_start_date,
            planned_end_date: u.planned_end_date,
            updated_at: now,
          })
          .eq('plan_id', u.plan_id)

        if (error) throw error
      }

      await syncAmbitionTargetDatesForCampaign(supabase, payload.campaign_id)
    },
    onSuccess: (_, variables) => {
      const id = variables.campaign_id
      queryClient.invalidateQueries({ queryKey: ['campaign', id] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['stage-plan-core', id] })
      queryClient.invalidateQueries({ queryKey: ['stage-plan-ambitions'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-ambitions-by-stage', id] })
      queryClient.invalidateQueries({ queryKey: ['gates', id] })
      for (let g = 1; g <= 5; g++) {
        queryClient.invalidateQueries({ queryKey: ['gate-ambitions', id, g] })
      }
    },
  })
}

/** Re-apply stage planned end → ambition target_date for non-overridden rows only */
export function useSyncAmbitionTargetDatesForCampaign() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (campaign_id: number) => {
      await syncAmbitionTargetDatesForCampaign(supabase, campaign_id)
    },
    onSuccess: (_, campaign_id) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['stage-plan-core', campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['stage-plan-ambitions'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-ambitions-by-stage', campaign_id] })
      for (let g = 1; g <= 5; g++) {
        queryClient.invalidateQueries({ queryKey: ['gate-ambitions', campaign_id, g] })
      }
    },
  })
}

export function useUpdateCampaignOrganiser() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async ({ campaign_id, organiser_id }: { campaign_id: number; organiser_id: number }) => {
      const { error } = await supabase
        .from('campaigns')
        .update({ organiser_id })
        .eq('campaign_id', campaign_id)

      if (error) throw error
    },
    onSuccess: (_, { campaign_id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

// ── Campaign Organiser Team ──────────────────────────────────────────────────

export interface CampaignOrganiserMember {
  id: number
  campaign_id: number
  campaign_role: string
  added_at: string
  organiser: {
    organiser_id: number
    organiser_name: string
    email: string | null
    user_profiles: Array<{ user_id: string; work_role: string | null; display_name: string }> | null
  } | null
  reports_to_organiser: {
    organiser_id: number
    organiser_name: string
    email: string | null
  } | null
}

export function useCampaignOrganisers(campaignId: number) {
  return useQuery({
    queryKey: ['campaign-organisers', campaignId],
    queryFn: async (): Promise<CampaignOrganiserMember[]> => {
      const res = await fetchApi(`/api/campaign-organisers/${campaignId}`)
      if (!res.ok) throw new Error('Failed to load campaign team')
      return res.json()
    },
    enabled: campaignId > 0,
  })
}

export function useAddCampaignOrganiser() {
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (payload: {
      campaign_id: number
      organiser_id: number
      campaign_role: string
      reports_to_organiser_id?: number | null
    }) => {
      const res = await fetchApi(`/api/campaign-organisers/${payload.campaign_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organiser_id: payload.organiser_id,
          campaign_role: payload.campaign_role,
          reports_to_organiser_id: payload.reports_to_organiser_id ?? null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to add team member')
      }
      return res.json()
    },
    onSuccess: (_, { campaign_id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-organisers', campaign_id] })
    },
  })
}

export function useUpdateCampaignTeamMember() {
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (payload: {
      campaign_id: number
      id: number
      campaign_role?: string
      reports_to_organiser_id?: number | null
    }) => {
      const res = await fetchApi(`/api/campaign-organisers/${payload.campaign_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payload.id,
          campaign_role: payload.campaign_role,
          reports_to_organiser_id: payload.reports_to_organiser_id,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to update team member')
      }
      return res.json()
    },
    onSuccess: (_, { campaign_id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-organisers', campaign_id] })
    },
  })
}

export function useRemoveCampaignOrganiser() {
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async ({ campaign_id, row_id }: { campaign_id: number; row_id: number }) => {
      const res = await fetchApi(`/api/campaign-organisers/${campaign_id}?rowId=${row_id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to remove team member')
      }
    },
    onSuccess: (_, { campaign_id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-organisers', campaign_id] })
    },
  })
}

export function useExistingCampaignForPlanning(campaignId: number | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['existing-campaign-for-planning', campaignId],
    queryFn: async () => {
      if (!campaignId) return null

      const traceId = generateTraceId()
      const startedAt = Date.now()
      logConnectionEvent({
        type: 'api_ok',
        detail: `planner-load-start campaign_id=${campaignId}`,
        traceId,
      })

      try {
        // Preemptively refresh the session before the query fires. Without this,
        // a freshly-loaded page with a near-expiry token can hit an auth-client
        // Web Lock deadlock that leaves the query hanging forever with no error.
        await ensureValidSession()

        const campaignsStart = Date.now()
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select(`
            campaign_id,
            name,
            description,
            campaign_type,
            status,
            organiser_id,
            start_date,
            end_date,
            enterprise_agreement_subtype,
            replaced_agreement_id,
            campaign_stage_plans(plan_id)
          `)
          .eq('campaign_id', campaignId)
          .maybeSingle()
        logConnectionEvent({
          type: 'api_ok',
          detail: `planner-load-campaigns-end found=${!!campaign}`,
          durationMs: Date.now() - campaignsStart,
          traceId,
        })

        if (error) throw error
        if (!campaign) {
          logConnectionEvent({
            type: 'api_ok',
            detail: 'planner-load-end: campaign not found',
            durationMs: Date.now() - startedAt,
            traceId,
          })
          return null
        }

        const timelineStart = Date.now()
        const { data: timeline } = await supabase
          .from('campaign_timelines')
          .select('timeline_id, agreement_id, agreement_expiry_date')
          .eq('campaign_id', campaignId)
          .maybeSingle()
        logConnectionEvent({
          type: 'api_ok',
          detail: `planner-load-timelines-end found=${!!timeline}`,
          durationMs: Date.now() - timelineStart,
          traceId,
        })

        // Pull all agreements attached via the M:N junction so the planner can
        // present full context (Phase 1 of campaigns review plan).
        const { data: attached } = await supabase
          .from('campaign_agreements')
          .select(
            `agreement_id, relationship_type, is_primary, sort_order,
             agreement:agreements(agreement_name, short_name, status, expiry_date)`
          )
          .eq('campaign_id', campaignId)
          .order('sort_order', { ascending: true })

        const attachedAgreements = (
          (attached ?? []) as unknown as Array<{
            agreement_id: number
            relationship_type: string
            is_primary: boolean
            sort_order: number
            agreement: {
              agreement_name: string
              short_name: string | null
              status: string | null
              expiry_date: string | null
            } | null
          }>
        ).map((a) => ({
          agreement_id: a.agreement_id,
          relationship_type: a.relationship_type as 'replaced' | 'new' | 'related',
          is_primary: a.is_primary,
          sort_order: a.sort_order,
          agreement_name: a.agreement?.agreement_name ?? null,
          short_name: a.agreement?.short_name ?? null,
          status: a.agreement?.status ?? null,
          expiry_date: a.agreement?.expiry_date ?? null,
        }))

        const result = {
          ...campaign,
          has_plan: (campaign.campaign_stage_plans?.length ?? 0) > 0,
          requires_replacement_agreement:
            campaign.enterprise_agreement_subtype === 'replacement',
          has_linked_agreement_context:
            !!campaign.replaced_agreement_id ||
            !!timeline?.agreement_id ||
            attachedAgreements.length > 0,
          timeline_agreement_id: timeline?.agreement_id ?? null,
          timeline_expiry_date: timeline?.agreement_expiry_date ?? null,
          attached_agreements: attachedAgreements,
        }

        logConnectionEvent({
          type: 'api_ok',
          detail: `planner-load-end has_plan=${result.has_plan}`,
          durationMs: Date.now() - startedAt,
          traceId,
        })

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logConnectionEvent({
          type: 'api_error',
          detail: `planner-load-error: ${msg}`,
          durationMs: Date.now() - startedAt,
          traceId,
        })
        throw err
      }
    },
    enabled: !!campaignId && campaignId > 0,
  })
}

export function useAddPlanToCampaign() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (payload: {
      campaign_id: number
      organiser_id?: number
      start_date?: string
      agreement_id?: number
      expiry_date?: string
      stage_dates?: PlannerStageDateInput[]
    }) => {
      const { data: existing } = await supabase
        .from('campaigns')
        .select('start_date')
        .eq('campaign_id', payload.campaign_id)
        .maybeSingle()

      const updates: Record<string, unknown> = { status: 'active' }
      if (payload.organiser_id) updates.organiser_id = payload.organiser_id
      if (!existing?.start_date && payload.start_date) {
        updates.start_date = payload.start_date
      }

      await supabase.from('campaigns').update(updates).eq('campaign_id', payload.campaign_id)

      const STAGE_NAMES_LIST = [
        'Contact ID & Mapping',
        'Intro Comms & Education',
        'Member Mobilisation',
        'Develop Claims / MSD',
        'Endorsement & Commence Bargaining',
        'Bargaining to Win',
      ]

      const stagePlans = STAGE_NAMES_LIST.map((name, i) => {
        const stageNum = i + 1
        const sd = payload.stage_dates?.find((s) => s.stage_number === stageNum)
        const status = sd?.plan_status ?? (stageNum === 1 ? 'active' : 'draft')
        return {
          campaign_id: payload.campaign_id,
          stage_number: stageNum,
          stage_name: name,
          status,
          planned_start_date: sd?.planned_start || null,
          planned_end_date: sd?.planned_end || null,
          actual_start_date: sd?.actual_start ?? null,
          actual_end_date: sd?.actual_end ?? null,
        }
      })

      // Use upsert with ignoreDuplicates so a retry after a partial failure
      // (e.g., interrupted wizard) doesn't fail on the unique constraint.
      const { error: plansError } = await supabase
        .from('campaign_stage_plans')
        .upsert(stagePlans, { onConflict: 'campaign_id,stage_number', ignoreDuplicates: true })
      if (plansError) throw plansError

      const { data: insertedPlans, error: plansSelectError } = await supabase
        .from('campaign_stage_plans')
        .select('plan_id, stage_number, planned_end_date')
        .eq('campaign_id', payload.campaign_id)
        .order('stage_number')

      if (plansSelectError) throw plansSelectError

      const membershipRows =
        insertedPlans?.flatMap((p) => [
          {
            plan_id: p.plan_id,
            custom_text: 'Expected new members',
            is_system_default: true,
            metric_type: 'count',
            sort_order: 0,
            target_date: p.planned_end_date,
            target_date_user_overridden: false,
            is_hard_gate: false,
          },
          {
            plan_id: p.plan_id,
            custom_text: 'Membership density',
            is_system_default: true,
            metric_type: 'percentage',
            sort_order: 1,
            target_date: p.planned_end_date,
            target_date_user_overridden: false,
            is_hard_gate: false,
          },
        ]) ?? []

      if (membershipRows.length > 0) {
        const { error: ambError } = await supabase.from('plan_ambitions').insert(membershipRows)
        if (ambError) throw ambError
      }

      const gates = [
        { gate_number: 1, gate_name: 'Member Engagement Threshold' },
        { gate_number: 2, gate_name: 'Engagement Ready Assessment' },
        { gate_number: 3, gate_name: 'Log of Claims Survey Participation' },
        { gate_number: 4, gate_name: 'Ready for Bargaining' },
        { gate_number: 5, gate_name: 'Strike Ready' },
      ].map((g) => ({
        campaign_id: payload.campaign_id,
        gate_number: g.gate_number,
        gate_name: g.gate_name,
        enforcement_type: 'soft',
      }))

      const { error: gatesError } = await supabase.from('gate_definitions').insert(gates)
      if (gatesError) throw gatesError

      if (payload.agreement_id || payload.expiry_date) {
        const expiryDate = payload.expiry_date
        const paboDate = expiryDate
          ? new Date(new Date(expiryDate).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : null

        const { data: timeline, error: timelineError } = await supabase
          .from('campaign_timelines')
          .insert({
            campaign_id: payload.campaign_id,
            agreement_id: payload.agreement_id,
            agreement_expiry_date: expiryDate || null,
            pabo_available_date: paboDate,
            peak_engagement_target_date: paboDate,
            working_backwards: !!expiryDate,
          })
          .select()
          .single()

        if (timelineError) throw timelineError

        if (payload.stage_dates && timeline) {
          const targets = payload.stage_dates.map((s) => ({
            timeline_id: timeline.timeline_id,
            stage_number: s.stage_number,
            planned_start: s.planned_start,
            planned_end: s.planned_end,
            duration_weeks: s.duration_weeks,
          }))

          await supabase.from('stage_timeline_targets').insert(targets)
        }
      }

      return { campaign_id: payload.campaign_id }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaign_id] })
      queryClient.invalidateQueries({ queryKey: ['existing-campaign-for-planning', variables.campaign_id] })
    },
  })
}

export function useCreateCampaign() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (payload: {
      name: string
      description?: string
      campaign_type: string
      organiser_id: number
      start_date?: string
      agreement_id?: number
      expiry_date?: string
      msd_required?: boolean
      stage_dates?: PlannerStageDateInput[]
      gate_overrides?: Partial<Record<number, { enforcement_type: string }>>
    }) => {
      type CampaignInsert = Database['public']['Tables']['campaigns']['Insert']
      const campaignInsert: CampaignInsert = {
        name: payload.name,
        description: payload.description,
        campaign_type: payload.campaign_type,
        organiser_id: payload.organiser_id,
        start_date: payload.start_date,
        status: 'active',
        ...(payload.msd_required != null ? { msd_required: payload.msd_required } : {}),
      }

      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert(campaignInsert)
        .select()
        .single()

      if (campaignError) throw campaignError

      const STAGE_NAMES = [
        'Contact ID & Mapping',
        'Intro Comms & Education',
        'Member Mobilisation',
        'Develop Claims / MSD',
        'Endorsement & Commence Bargaining',
        'Bargaining to Win',
      ]

      const stagePlans = STAGE_NAMES.map((name, i) => {
        const stageNum = i + 1
        const sd = payload.stage_dates?.find((s) => s.stage_number === stageNum)
        const status = sd?.plan_status ?? (stageNum === 1 ? 'active' : 'draft')
        return {
          campaign_id: campaign.campaign_id,
          stage_number: stageNum,
          stage_name: name,
          status,
          planned_start_date: sd?.planned_start || null,
          planned_end_date: sd?.planned_end || null,
          actual_start_date: sd?.actual_start ?? null,
          actual_end_date: sd?.actual_end ?? null,
        }
      })

      // Use upsert with ignoreDuplicates so a retry after a partial failure
      // (e.g., interrupted wizard) doesn't fail on the unique constraint.
      const { error: plansError } = await supabase
        .from('campaign_stage_plans')
        .upsert(stagePlans, { onConflict: 'campaign_id,stage_number', ignoreDuplicates: true })
      if (plansError) throw plansError

      const { data: insertedPlans, error: plansSelectError } = await supabase
        .from('campaign_stage_plans')
        .select('plan_id, stage_number, planned_end_date')
        .eq('campaign_id', campaign.campaign_id)
        .order('stage_number')

      if (plansSelectError) throw plansSelectError

      const membershipRows =
        insertedPlans?.flatMap((p) => [
          {
            plan_id: p.plan_id,
            custom_text: 'Expected new members',
            is_system_default: true,
            metric_type: 'count',
            sort_order: 0,
            target_date: p.planned_end_date,
            target_date_user_overridden: false,
            is_hard_gate: false,
          },
          {
            plan_id: p.plan_id,
            custom_text: 'Membership density',
            is_system_default: true,
            metric_type: 'percentage',
            sort_order: 1,
            target_date: p.planned_end_date,
            target_date_user_overridden: false,
            is_hard_gate: false,
          },
        ]) ?? []

      if (membershipRows.length > 0) {
        const { error: ambError } = await supabase.from('plan_ambitions').insert(membershipRows)
        if (ambError) throw ambError
      }

      // Create gate definitions
      const GATE_DEFAULTS = [
        { gate_number: 1, gate_name: 'Member Engagement Threshold', enforcement_type: 'soft' },
        { gate_number: 2, gate_name: 'Engagement Ready Assessment', enforcement_type: 'soft' },
        { gate_number: 3, gate_name: 'Log of Claims Survey Participation', enforcement_type: 'soft' },
        { gate_number: 4, gate_name: 'Ready for Bargaining', enforcement_type: 'soft' },
        { gate_number: 5, gate_name: 'Strike Ready', enforcement_type: 'soft' },
      ]

      const gates = GATE_DEFAULTS.map((g) => ({
        campaign_id: campaign.campaign_id,
        gate_number: g.gate_number,
        gate_name: g.gate_name,
        enforcement_type: 'soft',
      }))

      const { error: gatesError } = await supabase.from('gate_definitions').insert(gates)

      if (gatesError) throw gatesError

      // Gate criteria are driven by stage plan_ambitions (new campaigns). Legacy campaigns may still have seeded criteria.

      // Create timeline
      if (payload.agreement_id || payload.expiry_date) {
        const expiryDate = payload.expiry_date
        const paboDate = expiryDate
          ? new Date(new Date(expiryDate).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : null

        const { data: timeline, error: timelineError } = await supabase
          .from('campaign_timelines')
          .insert({
            campaign_id: campaign.campaign_id,
            agreement_id: payload.agreement_id,
            agreement_expiry_date: expiryDate || null,
            pabo_available_date: paboDate,
            peak_engagement_target_date: paboDate,
            working_backwards: !!expiryDate,
          })
          .select()
          .single()

        if (timelineError) throw timelineError

        // Create stage timeline targets
        if (payload.stage_dates && timeline) {
          const targets = payload.stage_dates.map((s) => ({
            timeline_id: timeline.timeline_id,
            stage_number: s.stage_number,
            planned_start: s.planned_start,
            planned_end: s.planned_end,
            duration_weeks: s.duration_weeks,
          }))

          await supabase.from('stage_timeline_targets').insert(targets)
        }
      }

      return campaign
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

export function useDeleteCampaign() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (campaignId: number) => {
      const { error } = await supabase.rpc('delete_campaign', { p_campaign_id: campaignId })
      if (error) throw error
    },
    onSuccess: (_data, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
    },
  })
}
