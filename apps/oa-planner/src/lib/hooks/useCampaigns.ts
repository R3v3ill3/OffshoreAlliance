'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

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

export function useCampaign(id: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
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
            agreements(agreement_name, short_name, expiry_date, status),
            stage_timeline_targets(*)
          ),
          gate_definitions(
            *,
            gate_criteria(*)
          )
        `)
        .eq('campaign_id', id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateCampaign() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      name: string
      description?: string
      campaign_type: string
      organiser_id: number
      start_date?: string
      agreement_id?: number
      expiry_date?: string
      msd_required?: boolean
      stage_dates?: Array<{ stage_number: number; planned_start: string; planned_end: string; duration_weeks: number }>
      gate_overrides?: Partial<Record<number, { enforcement_type: string }>>
    }) => {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          name: payload.name,
          description: payload.description,
          campaign_type: payload.campaign_type,
          organiser_id: payload.organiser_id,
          start_date: payload.start_date,
          status: 'active',
        })
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
        const stageDates = payload.stage_dates?.find((s) => s.stage_number === stageNum)
        return {
          campaign_id: campaign.campaign_id,
          stage_number: stageNum,
          stage_name: name,
          status: stageNum === 1 ? 'active' : 'draft',
          planned_start_date: stageDates?.planned_start || null,
          planned_end_date: stageDates?.planned_end || null,
        }
      })

      const { error: plansError } = await supabase.from('campaign_stage_plans').insert(stagePlans)
      if (plansError) throw plansError

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
        enforcement_type: payload.gate_overrides?.[g.gate_number]?.enforcement_type || g.enforcement_type,
      }))

      const { data: createdGates, error: gatesError } = await supabase
        .from('gate_definitions')
        .insert(gates)
        .select()

      if (gatesError) throw gatesError

      // Create gate criteria from defaults
      const DEFAULT_CRITERIA: Record<number, Array<{ criterion_name: string; metric_type: string; target_value: string; description: string; is_hard_gate: boolean }>> = {
        1: [
          { criterion_name: 'Contact Rate', metric_type: 'percentage', target_value: '60', description: 'Percentage of identified contacts successfully reached', is_hard_gate: false },
          { criterion_name: 'Response Rate', metric_type: 'percentage', target_value: '40', description: 'Percentage of contacted workers who responded/engaged', is_hard_gate: false },
          { criterion_name: 'Mapping Completion', metric_type: 'percentage', target_value: '80', description: 'Percentage of worksite/crew mapping completed', is_hard_gate: false },
          { criterion_name: 'Contact Details Verified', metric_type: 'percentage', target_value: '50', description: 'Percentage of contacts with verified name, phone, email', is_hard_gate: false },
        ],
        2: [
          { criterion_name: 'Education Participation', metric_type: 'percentage', target_value: '50', description: 'Percentage of contacts who attended an education/info session', is_hard_gate: false },
          { criterion_name: 'Shared Responsibility Commitment', metric_type: 'percentage', target_value: '40', description: 'Percentage engaged who confirmed shared responsibility', is_hard_gate: false },
          { criterion_name: 'WOC Established', metric_type: 'boolean', target_value: 'true', description: 'At least one WOC established on a key worksite', is_hard_gate: false },
          { criterion_name: 'Engagement Quality Score', metric_type: 'percentage', target_value: '60', description: 'Percentage of contacts rated as actively engaged', is_hard_gate: false },
        ],
        3: [
          { criterion_name: 'Log of Claims Survey Completion', metric_type: 'percentage', target_value: '60', description: 'Percentage of members who completed the Log of Claims survey', is_hard_gate: false },
          { criterion_name: 'Membership Density', metric_type: 'percentage', target_value: '50', description: 'Union membership as percentage of workers on agreement scope', is_hard_gate: false },
          { criterion_name: 'Active WOCs', metric_type: 'count', target_value: '2', description: 'Number of active WOCs across worksites', is_hard_gate: false },
          { criterion_name: 'Delegate Coverage', metric_type: 'percentage', target_value: '50', description: 'Percentage of mapped areas with an active member contact', is_hard_gate: false },
        ],
        4: [
          { criterion_name: 'Claims Endorsement', metric_type: 'percentage', target_value: '70', description: 'Percentage of members who endorsed the final Log of Claims', is_hard_gate: false },
          { criterion_name: 'Bargaining Reps Nominated', metric_type: 'boolean', target_value: 'true', description: 'Bargaining representatives formally nominated', is_hard_gate: false },
          { criterion_name: 'MSD Achieved (if required)', metric_type: 'percentage', target_value: '50', description: 'Majority Support Determination — 50%+ is NON-NEGOTIABLE if MSD required', is_hard_gate: payload.msd_required ?? false },
          { criterion_name: 'Strike Readiness Indicator', metric_type: 'percentage', target_value: '60', description: 'Percentage indicating willingness to take protected action', is_hard_gate: false },
        ],
        5: [
          { criterion_name: 'Strike Readiness Assessment', metric_type: 'percentage', target_value: '70', description: 'Formal strike readiness assessment score', is_hard_gate: false },
          { criterion_name: 'Communication Network Tested', metric_type: 'boolean', target_value: 'true', description: '2-way communication network tested and functional', is_hard_gate: false },
          { criterion_name: 'WOC Coverage', metric_type: 'percentage', target_value: '80', description: 'Percentage of key worksites with active WOC', is_hard_gate: false },
          { criterion_name: 'PABO Preparation Complete', metric_type: 'boolean', target_value: 'true', description: 'PABO application materials prepared and ready to file', is_hard_gate: false },
        ],
      }

      const allCriteria = createdGates!.flatMap((gate) =>
        (DEFAULT_CRITERIA[gate.gate_number] || []).map((c, i) => ({
          gate_id: gate.gate_id,
          criterion_name: c.criterion_name,
          metric_type: c.metric_type,
          target_value: c.target_value,
          description: c.description,
          is_hard_gate: c.is_hard_gate,
          sort_order: i,
        }))
      )

      const { error: criteriaError } = await supabase.from('gate_criteria').insert(allCriteria)
      if (criteriaError) throw criteriaError

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
