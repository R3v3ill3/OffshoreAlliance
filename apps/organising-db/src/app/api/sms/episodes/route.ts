/**
 * Standalone SMS episode campaigns (hidden campaigns.is_sms_episode).
 *
 * GET  — list hidden episodes with their blasts/chats and surveys.
 * POST — create a hidden campaign; creator is created_by so
 *        can_write_to_campaign holds without widening RLS.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import {
  SMS_EPISODE_UNTITLED,
  type SmsEpisodeKind,
} from '@/lib/sms/sms-episode'
import type {
  SmsSurveyRow,
  VwSmsCampaignSummaryRowWithMode,
  VwSmsSurveyFunnelRow,
} from '@/types/sms'

const createSchema = z.object({
  name: z.string().trim().max(200).optional(),
  kind: z.enum(['blast', 'survey', 'chat']).optional(),
})

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: episodes, error } = await supabase
      .from('campaigns')
      .select('campaign_id, name, created_at, created_by')
      .eq('is_sms_episode', true)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const rows = episodes ?? []
    if (rows.length === 0) return NextResponse.json([])

    const ids = rows.map((e) => e.campaign_id)
    const [{ data: lists }, { data: surveys }] = await Promise.all([
      supabase
        .from('vw_sms_campaign_summary')
        .select('*')
        .in('campaign_id', ids)
        .order('created_at', { ascending: false }),
      supabase
        .from('sms_surveys')
        .select('*')
        .in('campaign_id', ids)
        .order('created_at', { ascending: false }),
    ])

    const surveyRows = (surveys ?? []) as SmsSurveyRow[]
    const surveyIds = surveyRows.map((s) => s.survey_id)
    const [{ data: funnels }, { data: qrows }] = await Promise.all([
      surveyIds.length > 0
        ? supabase.from('vw_sms_survey_funnel').select('*').in('survey_id', surveyIds)
        : Promise.resolve({ data: [] as VwSmsSurveyFunnelRow[], error: null }),
      surveyIds.length > 0
        ? supabase
            .from('sms_survey_questions')
            .select('survey_id')
            .in('survey_id', surveyIds)
        : Promise.resolve({ data: [] as Array<{ survey_id: number }>, error: null }),
    ])

    const funnelBySurvey = new Map<number, VwSmsSurveyFunnelRow>(
      ((funnels ?? []) as VwSmsSurveyFunnelRow[]).map((f) => [f.survey_id, f]),
    )
    const questionCounts = new Map<number, number>()
    for (const q of qrows ?? []) {
      const sid = q.survey_id as number
      questionCounts.set(sid, (questionCounts.get(sid) ?? 0) + 1)
    }

    const listsByCampaign = new Map<number, VwSmsCampaignSummaryRowWithMode[]>()
    for (const list of (lists ?? []) as VwSmsCampaignSummaryRowWithMode[]) {
      const bucket = listsByCampaign.get(list.campaign_id) ?? []
      bucket.push(list)
      listsByCampaign.set(list.campaign_id, bucket)
    }

    const surveysByCampaign = new Map<
      number,
      Array<{
        survey_id: number
        title: string
        status: string
        is_test: boolean
        purpose: string
        question_count: number
        funnel: VwSmsSurveyFunnelRow | null
        created_at: string
      }>
    >()
    for (const s of surveyRows) {
      const { receipt_salt: _salt, ...safe } = s
      void _salt
      const bucket = surveysByCampaign.get(s.campaign_id) ?? []
      bucket.push({
        survey_id: safe.survey_id,
        title: safe.title,
        status: safe.status,
        is_test: !!safe.is_test,
        purpose: safe.purpose ?? 'survey',
        question_count: questionCounts.get(s.survey_id) ?? 0,
        funnel: funnelBySurvey.get(s.survey_id) ?? null,
        created_at: safe.created_at,
      })
      surveysByCampaign.set(s.campaign_id, bucket)
    }

    return NextResponse.json(
      rows.map((e) => ({
        campaign_id: e.campaign_id,
        name: e.name,
        created_at: e.created_at,
        created_by: e.created_by,
        lists: listsByCampaign.get(e.campaign_id) ?? [],
        surveys: surveysByCampaign.get(e.campaign_id) ?? [],
      })),
    )
  } catch (error) {
    console.error('GET /api/sms/episodes error:', error)
    return errorResponse('Failed to fetch SMS episodes', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, organiser_id')
      .eq('user_id', user.id)
      .single()
    if (!profile || profile.role === 'viewer') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 },
      )
    }

    let body: z.infer<typeof createSchema>
    try {
      const raw = await req.json().catch(() => ({}))
      body = createSchema.parse(raw ?? {})
    } catch (err) {
      const message =
        err instanceof z.ZodError
          ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : 'Invalid request body'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const kind: SmsEpisodeKind = body.kind ?? 'blast'
    const name = body.name?.trim() || SMS_EPISODE_UNTITLED[kind]

    const { data: episode, error } = await supabase
      .from('campaigns')
      .insert({
        name,
        campaign_type: 'organising',
        status: 'active',
        is_sms_episode: true,
        created_by: user.id,
        organiser_id: profile.organiser_id,
        current_phase: 'standalone_activities',
      })
      .select('campaign_id, name, created_at, created_by')
      .single()
    if (error) throw error

    return NextResponse.json(
      {
        ...episode,
        lists: [],
        surveys: [],
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/sms/episodes error:', error)
    return errorResponse('Failed to create standalone SMS episode', error)
  }
}
