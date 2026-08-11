/**
 * SMS surveys for a campaign (brief §4.1, Phase 4).
 *
 * GET  — survey rows merged with vw_sms_survey_funnel counts + question
 *        counts.
 * POST — create a draft survey + its question list. Branch targets in
 *        the payload reference question INDEXES; they are rewritten to
 *        real question_ids after insert. RLS (can_write_to_campaign)
 *        applies through the user client for both tables.
 *
 * Follows /api/campaigns/[id]/sms-lists conventions (auth, RLS,
 * checkRateLimit on mutations).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { isValidTimeZone } from '@/lib/sms/blackout'
import {
  validateSurveyQuestions,
  validateSurveySettings,
  type SurveyQuestionInput,
  type SurveySettingsInput,
} from '@/lib/sms/survey-validation'
import { insertSurveyQuestions } from '@/lib/sms/survey-authoring'
import type { SmsSurveyRow, VwSmsSurveyFunnelRow } from '@/types/sms'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: surveys, error } = await supabase
      .from('sms_surveys')
      .select('*')
      .eq('campaign_id', cid)
      .order('created_at', { ascending: false })
    if (error) throw error
    const rows = (surveys ?? []) as SmsSurveyRow[]
    if (rows.length === 0) return NextResponse.json([])

    const surveyIds = rows.map((s) => s.survey_id)
    const [{ data: funnels }, { data: questionRows }] = await Promise.all([
      supabase.from('vw_sms_survey_funnel').select('*').in('survey_id', surveyIds),
      supabase
        .from('sms_survey_questions')
        .select('survey_id')
        .in('survey_id', surveyIds),
    ])
    const funnelBySurvey = new Map<number, VwSmsSurveyFunnelRow>(
      ((funnels ?? []) as VwSmsSurveyFunnelRow[]).map((f) => [f.survey_id, f]),
    )
    const questionCounts = new Map<number, number>()
    for (const q of questionRows ?? []) {
      const sid = q.survey_id as number
      questionCounts.set(sid, (questionCounts.get(sid) ?? 0) + 1)
    }

    return NextResponse.json(
      rows.map((s) => {
        // Never serve the receipt salt to clients (Phase 5): with the
        // salt, staff could brute-force receipt → member mappings.
        const { receipt_salt: _salt, ...safe } = s
        void _salt
        return {
          ...safe,
          question_count: questionCounts.get(s.survey_id) ?? 0,
          funnel: funnelBySurvey.get(s.survey_id) ?? null,
        }
      }),
    )
  } catch (error) {
    console.error('GET sms-surveys error:', error)
    return errorResponse('Failed to fetch SMS surveys', error)
  }
}

interface CreateSurveyBody extends SurveySettingsInput {
  questions?: SurveyQuestionInput[]
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

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

    const body = (await req.json()) as CreateSurveyBody
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      return NextResponse.json(
        { error: `Invalid timezone "${body.timezone}"` },
        { status: 400 },
      )
    }
    const errors = [
      ...validateSurveySettings(body),
      ...validateSurveyQuestions(body.questions ?? [], body.purpose),
    ]
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 })
    }

    // The rating target must live in this campaign — build-time
    // validation is what makes the webhook's admin-client rating
    // writes safe (Phase 4 plan).
    if (body.activity_id != null) {
      const { data: activity } = await supabase
        .from('campaign_activities')
        .select('activity_id, campaign_id')
        .eq('activity_id', body.activity_id)
        .maybeSingle()
      if (!activity || activity.campaign_id !== cid) {
        return NextResponse.json(
          { error: 'Activity not found in this campaign' },
          { status: 400 },
        )
      }
    }

    const { data: survey, error: surveyErr } = await supabase
      .from('sms_surveys')
      .insert({
        campaign_id: cid,
        activity_id: body.activity_id ?? null,
        title: body.title.trim(),
        // Phase 5: ballots ride the same table — purpose plus the
        // integrity settings (revote policy defaults to 'locked' per
        // brief §8.1; receipt_salt comes from the column default).
        purpose: body.purpose === 'indicative_ballot' ? 'indicative_ballot' : 'survey',
        revote_policy:
          body.revote_policy === 'revote_until_close'
            ? 'revote_until_close'
            : 'locked',
        results_restricted: !!body.results_restricted,
        status: 'draft',
        retry_limit: body.retry_limit ?? 2,
        question_timeout_minutes: body.question_timeout_minutes ?? 240,
        session_ttl_hours: body.session_ttl_hours ?? 72,
        reminder_offsets: body.reminder_offsets ?? [1440, 2880],
        handoff_escalate_to: body.handoff_escalate_to ?? null,
        sender_number_id: body.sender_number_id ?? null,
        timezone: body.timezone || 'Australia/Perth',
        blackout_override: !!body.blackout_override,
        blackout_override_reason: body.blackout_override
          ? (body.blackout_override_reason?.trim() ?? null)
          : null,
        invitation_body: body.invitation_body ?? null,
        completion_body: body.completion_body ?? null,
        created_by: user.id,
      })
      .select('survey_id')
      .single()
    if (surveyErr) throw surveyErr

    await insertSurveyQuestions(supabase, survey.survey_id, body.questions!)

    return NextResponse.json({ survey_id: survey.survey_id }, { status: 201 })
  } catch (error) {
    console.error('POST sms-surveys error:', error)
    return errorResponse('Failed to create SMS survey', error)
  }
}
