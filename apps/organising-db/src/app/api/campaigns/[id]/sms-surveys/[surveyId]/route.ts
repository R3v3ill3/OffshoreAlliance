/**
 * SMS survey detail + draft editing.
 *
 * GET    — survey + questions + funnel + per-question stats (the §4.1
 *          funnel report: invited → started → completed, per-question
 *          drop-off and invalid-reply rate).
 * PATCH  — draft-only edits (settings + wholesale question replacement;
 *          sessions pin survey_version, and post-open immutability is
 *          the Phase 4 simplification).
 * DELETE — draft-only.
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
import type { SmsSurveyRow } from '@/types/sms'

async function loadSurvey(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cid: number,
  sid: number,
): Promise<SmsSurveyRow | null> {
  const { data, error } = await supabase
    .from('sms_surveys')
    .select('*')
    .eq('survey_id', sid)
    .maybeSingle()
  if (error) throw error
  if (!data || (data as SmsSurveyRow).campaign_id !== cid) return null
  return data as SmsSurveyRow
}

function parseIds(campaignId: string, surveyId: string) {
  const cid = parseInt(campaignId, 10)
  const sid = parseInt(surveyId, 10)
  return Number.isFinite(cid) && Number.isFinite(sid) ? { cid, sid } : null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  try {
    const { id: campaignId, surveyId } = await params
    const ids = parseIds(campaignId, surveyId)
    if (!ids) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const survey = await loadSurvey(supabase, ids.cid, ids.sid)
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    const [{ data: questions }, { data: funnel }, { data: questionStats }] =
      await Promise.all([
        supabase
          .from('sms_survey_questions')
          .select('*')
          .eq('survey_id', ids.sid)
          .order('sort_order', { ascending: true })
          .order('question_id', { ascending: true }),
        supabase
          .from('vw_sms_survey_funnel')
          .select('*')
          .eq('survey_id', ids.sid)
          .maybeSingle(),
        supabase
          .from('vw_sms_survey_question_stats')
          .select('*')
          .eq('survey_id', ids.sid)
          .order('sort_order', { ascending: true }),
      ])

    return NextResponse.json({
      survey,
      questions: questions ?? [],
      funnel: funnel ?? null,
      question_stats: questionStats ?? [],
    })
  } catch (error) {
    console.error('GET sms-survey detail error:', error)
    return errorResponse('Failed to fetch SMS survey', error)
  }
}

interface PatchSurveyBody extends SurveySettingsInput {
  questions?: SurveyQuestionInput[]
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  try {
    const { id: campaignId, surveyId } = await params
    const ids = parseIds(campaignId, surveyId)
    if (!ids) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

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

    const survey = await loadSurvey(supabase, ids.cid, ids.sid)
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    if (survey.status !== 'draft') {
      return NextResponse.json(
        {
          error: `Only draft surveys can be edited (status: ${survey.status}) — sessions pin the version they started on`,
        },
        { status: 409 },
      )
    }

    const body = (await req.json()) as PatchSurveyBody
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      return NextResponse.json(
        { error: `Invalid timezone "${body.timezone}"` },
        { status: 400 },
      )
    }
    const errors = [
      ...validateSurveySettings(body),
      ...(body.questions !== undefined
        ? validateSurveyQuestions(body.questions)
        : []),
    ]
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 })
    }

    if (body.activity_id != null) {
      const { data: activity } = await supabase
        .from('campaign_activities')
        .select('activity_id, campaign_id')
        .eq('activity_id', body.activity_id)
        .maybeSingle()
      if (!activity || activity.campaign_id !== ids.cid) {
        return NextResponse.json(
          { error: 'Activity not found in this campaign' },
          { status: 400 },
        )
      }
    }

    const update: Record<string, unknown> = {}
    if (body.title !== undefined) update.title = body.title.trim()
    if (body.activity_id !== undefined) update.activity_id = body.activity_id
    if (body.sender_number_id !== undefined) {
      update.sender_number_id = body.sender_number_id
    }
    if (body.timezone !== undefined) update.timezone = body.timezone
    if (body.blackout_override !== undefined) {
      update.blackout_override = body.blackout_override
      update.blackout_override_reason = body.blackout_override
        ? (body.blackout_override_reason?.trim() ?? null)
        : null
    }
    if (body.retry_limit !== undefined) update.retry_limit = body.retry_limit
    if (body.question_timeout_minutes !== undefined) {
      update.question_timeout_minutes = body.question_timeout_minutes
    }
    if (body.session_ttl_hours !== undefined) {
      update.session_ttl_hours = body.session_ttl_hours
    }
    if (body.reminder_offsets !== undefined) {
      update.reminder_offsets = body.reminder_offsets
    }
    if (body.handoff_escalate_to !== undefined) {
      update.handoff_escalate_to = body.handoff_escalate_to
    }
    if (body.invitation_body !== undefined) {
      update.invitation_body = body.invitation_body
    }
    if (body.completion_body !== undefined) {
      update.completion_body = body.completion_body
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('sms_surveys')
        .update(update)
        .eq('survey_id', ids.sid)
      if (error) throw error
    }

    if (body.questions !== undefined) {
      // Wholesale replacement — draft-only, so no sessions/answers
      // reference the outgoing rows.
      const { error: delErr } = await supabase
        .from('sms_survey_questions')
        .delete()
        .eq('survey_id', ids.sid)
      if (delErr) throw delErr
      await insertSurveyQuestions(supabase, ids.sid, body.questions)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH sms-survey error:', error)
    return errorResponse('Failed to update SMS survey', error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  try {
    const { id: campaignId, surveyId } = await params
    const ids = parseIds(campaignId, surveyId)
    if (!ids) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

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

    const survey = await loadSurvey(supabase, ids.cid, ids.sid)
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    if (survey.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft surveys can be deleted — close it instead' },
        { status: 409 },
      )
    }

    const { error } = await supabase
      .from('sms_surveys')
      .delete()
      .eq('survey_id', ids.sid)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE sms-survey error:', error)
    return errorResponse('Failed to delete SMS survey', error)
  }
}
