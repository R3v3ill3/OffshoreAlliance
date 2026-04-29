/**
 * POST /api/soc-wizard/context-snapshot
 *
 * Server-side helper that flattens campaign + stage context into a single
 * JSON object for the SOC wizard to store as `context_snapshot` on a new
 * session. Used when the wizard is invoked standalone with query params
 * (`?campaign_id=…&stage_number=…`) and the planner React hooks aren't
 * already mounted.
 *
 * Body: { campaign_id: number, stage_number?: number }
 * Returns: { snapshot: SocContextSnapshot }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface SocContextSnapshot {
  campaign: {
    campaign_id: number
    name: string
    description: string | null
    notes: string | null
    campaign_type: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
  }
  agreement: {
    agreement_name: string | null
    short_name: string | null
    expiry_date: string | null
    is_greenfield: boolean | null
  } | null
  organiser: {
    organiser_name: string | null
    email: string | null
    phone: string | null
  } | null
  stage: {
    plan_id: number | null
    stage_number: number
    stage_name: string | null
    status: string | null
  } | null
  ambitions: Array<{
    ambition_id: number
    custom_text: string | null
    target_value: number | string | null
    target_unit: string | null
    target_date: string | null
    metric_type: string | null
  }>
  where_to_play: Array<{
    wtp_id: number
    category_name: string | null
    option_text: string
    custom_text: string | null
    priority: number | null
    is_exclusion: boolean | null
    rationale: string | null
  }>
  capacities: Array<{
    capacity_id: number
    option_text: string | null
    custom_text: string | null
    status: string
    gap_description: string | null
  }>
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { campaign_id, stage_number } = await req.json()
    if (!campaign_id || typeof campaign_id !== 'number') {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
    }

    // Campaign + organiser + agreements + stage plans
    const { data: campaign, error: campaignErr } = await supabase
      .from('campaigns')
      .select(`
        campaign_id, name, description, notes, campaign_type, status,
        start_date, end_date,
        organisers(organiser_name, email, phone),
        campaign_stage_plans(plan_id, stage_number, stage_name, status),
        campaign_timelines(
          agreements(agreement_name, short_name, expiry_date, is_greenfield)
        )
      `)
      .eq('campaign_id', campaign_id)
      .maybeSingle()

    if (campaignErr) throw campaignErr
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Resolve the stage plan for the requested stage (if any)
    const stagePlans = (campaign.campaign_stage_plans || []) as Array<{
      plan_id: number; stage_number: number; stage_name: string | null; status: string | null
    }>
    const stagePlan = stage_number
      ? stagePlans.find((p) => p.stage_number === stage_number) || null
      : null

    // Per-stage planning rows (only if a stage was provided)
    let ambitions: SocContextSnapshot['ambitions'] = []
    let whereToPlay: SocContextSnapshot['where_to_play'] = []
    let capacities: SocContextSnapshot['capacities'] = []

    if (stagePlan) {
      const [{ data: amb }, { data: wtp }, { data: caps }] = await Promise.all([
        supabase
          .from('plan_ambitions')
          .select('ambition_id, custom_text, target_value, target_unit, target_date, metric_type')
          .eq('plan_id', stagePlan.plan_id),
        supabase
          .from('plan_where_to_play')
          .select(`
            wtp_id, custom_text, priority, is_exclusion, rationale,
            wtp_categories(category_name),
            wtp_options(option_text)
          `)
          .eq('plan_id', stagePlan.plan_id),
        supabase
          .from('plan_capacities')
          .select(`
            capacity_id, custom_text, status, gap_description,
            capacity_options(option_text)
          `)
          .eq('plan_id', stagePlan.plan_id),
      ])

      ambitions = (amb || []) as SocContextSnapshot['ambitions']

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      whereToPlay = ((wtp as any[]) || []).map((w) => ({
        wtp_id: w.wtp_id,
        category_name: w.wtp_categories?.category_name ?? null,
        option_text: w.wtp_options?.option_text ?? w.custom_text ?? '',
        custom_text: w.custom_text,
        priority: w.priority,
        is_exclusion: w.is_exclusion,
        rationale: w.rationale,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capacities = ((caps as any[]) || []).map((c) => ({
        capacity_id: c.capacity_id,
        option_text: c.capacity_options?.option_text ?? null,
        custom_text: c.custom_text,
        status: c.status,
        gap_description: c.gap_description,
      }))
    }

    // Normalise the agreement (one campaign timeline → one agreement, by convention)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timelines = (campaign as any).campaign_timelines || []
    const agreement = timelines[0]?.agreements
      ? {
          agreement_name: timelines[0].agreements.agreement_name ?? null,
          short_name: timelines[0].agreements.short_name ?? null,
          expiry_date: timelines[0].agreements.expiry_date ?? null,
          is_greenfield: timelines[0].agreements.is_greenfield ?? null,
        }
      : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organiser = (campaign as any).organisers
      ? {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          organiser_name: (campaign as any).organisers.organiser_name ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          email: (campaign as any).organisers.email ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          phone: (campaign as any).organisers.phone ?? null,
        }
      : null

    const snapshot: SocContextSnapshot = {
      campaign: {
        campaign_id: campaign.campaign_id,
        name: campaign.name,
        description: campaign.description,
        notes: campaign.notes,
        campaign_type: campaign.campaign_type,
        status: campaign.status,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
      },
      agreement,
      organiser,
      stage: stagePlan
        ? {
            plan_id: stagePlan.plan_id,
            stage_number: stagePlan.stage_number,
            stage_name: stagePlan.stage_name,
            status: stagePlan.status,
          }
        : stage_number
        ? { plan_id: null, stage_number, stage_name: null, status: null }
        : null,
      ambitions,
      where_to_play: whereToPlay,
      capacities,
    }

    return NextResponse.json({ snapshot })
  } catch (error) {
    console.error('SOC context-snapshot error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
