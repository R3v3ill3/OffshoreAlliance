/**
 * Visual survey report feed.
 *
 * GET — the funnel headline (invited → started → completed), the
 * question list, and the aggregate answer distribution behind the
 * per-question pie charts. Deliberately lighter than the detail GET
 * (no ballot receipt recomputation, no per-session reads) because
 * the dashboard re-polls this while a survey is live.
 *
 * Everything served here is aggregate: counts per (question,
 * parsed_value), never a worker id or a raw body. That is the same
 * privacy class as the ballot tally, so restricted ballots are
 * allowed through — with the ballot reading of a response (completed
 * sessions only; an abandoned half-vote is not a vote).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import type {
  SmsSurveyQuestionRow,
  SmsSurveyRow,
  VwSmsSurveyAnswerDistributionRow,
  VwSmsSurveyFunnelRow,
  VwSmsSurveyQuestionStatsRow,
} from '@/types/sms'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  try {
    const { id: campaignId, surveyId } = await params
    const cid = parseInt(campaignId, 10)
    const sid = parseInt(surveyId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: surveyRow, error: surveyErr } = await supabase
      .from('sms_surveys')
      .select(
        'survey_id, campaign_id, title, purpose, status, is_test, results_restricted, opened_at, closed_at',
      )
      .eq('survey_id', sid)
      .maybeSingle()
    if (surveyErr) throw surveyErr
    const survey = surveyRow as Pick<
      SmsSurveyRow,
      | 'survey_id'
      | 'campaign_id'
      | 'title'
      | 'purpose'
      | 'status'
      | 'is_test'
      | 'results_restricted'
      | 'opened_at'
      | 'closed_at'
    > | null
    if (!survey || survey.campaign_id !== cid) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    const [
      { data: questions, error: qErr },
      { data: funnel, error: fErr },
      { data: questionStats, error: sErr },
      { data: distribution, error: dErr },
    ] = await Promise.all([
      supabase
        .from('sms_survey_questions')
        .select('question_id, survey_id, sort_order, prompt, qtype, options')
        .eq('survey_id', sid)
        .is('retired_at', null)
        .order('sort_order', { ascending: true })
        .order('question_id', { ascending: true }),
      supabase
        .from('vw_sms_survey_funnel')
        .select('*')
        .eq('survey_id', sid)
        .maybeSingle(),
      supabase
        .from('vw_sms_survey_question_stats')
        .select('*')
        .eq('survey_id', sid)
        .order('sort_order', { ascending: true }),
      supabase
        .from('vw_sms_survey_answer_distribution')
        .select('*')
        .eq('survey_id', sid)
        .order('sort_order', { ascending: true })
        .order('parsed_value', { ascending: true }),
    ])
    if (qErr) throw qErr
    if (fErr) throw fErr
    if (sErr) throw sErr
    if (dErr) throw dErr

    return NextResponse.json({
      survey,
      questions: (questions ?? []) as Pick<
        SmsSurveyQuestionRow,
        'question_id' | 'survey_id' | 'sort_order' | 'prompt' | 'qtype' | 'options'
      >[],
      funnel: (funnel ?? null) as VwSmsSurveyFunnelRow | null,
      question_stats: (questionStats ?? []) as VwSmsSurveyQuestionStatsRow[],
      distribution: (distribution ?? []) as VwSmsSurveyAnswerDistributionRow[],
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('GET sms-survey report error:', error)
    return errorResponse('Failed to fetch SMS survey report', error)
  }
}
