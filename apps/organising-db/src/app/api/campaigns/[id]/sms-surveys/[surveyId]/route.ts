/**
 * SMS survey detail + draft editing.
 *
 * GET    — survey + questions + funnel + per-question stats (the §4.1
 *          funnel report: invited → started → completed, per-question
 *          drop-off and invalid-reply rate). For indicative ballots
 *          (Phase 5, brief §4.2) a `ballot` block is added: turnout vs
 *          the frozen roll, the aggregate tally (view rows — no worker
 *          ids), the RECOMPUTED receipt list (codes only, sorted
 *          lexicographically so list order cannot be correlated with
 *          vote timing) and the append-only event log.
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
import { computeBallotReceipt } from '@/lib/sms/ballot'
import {
  validateSurveyQuestions,
  validateSurveySettings,
  type SurveyQuestionInput,
  type SurveySettingsInput,
} from '@/lib/sms/survey-validation'
import { insertSurveyQuestions } from '@/lib/sms/survey-authoring'
import type {
  SmsBallotDetail,
  SmsBallotEventRow,
  SmsSurveyQuestionRow,
  SmsSurveyRow,
  VwSmsBallotTallyRow,
} from '@/types/sms'

/** PostgREST caps responses at 1000 rows — page reads. */
const PAGE_SIZE = 1000

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

/**
 * Ballot extras (Phase 5, §4.2). Receipts are RECOMPUTED over the
 * completed sessions — never stored — and returned as codes only:
 * a voter reads their code from their own phone, staff confirm "your
 * receipt appears in the list". Lexicographic sort deliberately
 * destroys any correlation with vote timing. All reads ride the
 * authenticated client (sessions/answers/roll/events are staff-
 * readable under RLS).
 */
async function loadBallotDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  survey: SmsSurveyRow,
  questions: SmsSurveyQuestionRow[],
  completedCount: number,
): Promise<SmsBallotDetail> {
  const sid = survey.survey_id

  const [{ count: rollCount }, { data: tally }, { data: events }] =
    await Promise.all([
      supabase
        .from('sms_ballot_roll')
        .select('roll_id', { count: 'exact', head: true })
        .eq('survey_id', sid),
      supabase
        .from('vw_sms_ballot_tally')
        .select('*')
        .eq('survey_id', sid)
        .order('sort_order', { ascending: true })
        .order('parsed_value', { ascending: true }),
      supabase
        .from('sms_ballot_events')
        .select('*')
        .eq('survey_id', sid)
        .order('occurred_at', { ascending: false })
        .order('event_id', { ascending: false })
        .limit(200),
    ])

  // Completed sessions (paged) → their parsed answers (chunked).
  const sessions: Array<{ session_id: number; worker_id: number }> = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sms_survey_sessions')
      .select('session_id, worker_id')
      .eq('survey_id', sid)
      .eq('state', 'completed')
      .order('session_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    sessions.push(...((data ?? []) as typeof sessions))
    if (!data || data.length < PAGE_SIZE) break
  }

  const answersBySession = new Map<number, Map<number, string>>()
  const sessionIds = sessions.map((s) => s.session_id)
  // Chunk so a full chunk of sessions × questions stays under the
  // 1000-row PostgREST cap (a fixed chunk would truncate answers on
  // >10-question ballots and corrupt the recomputed receipts).
  const answerChunk = Math.max(
    1,
    Math.floor(PAGE_SIZE / Math.max(1, questions.length)),
  )
  for (let i = 0; i < sessionIds.length; i += answerChunk) {
    const { data, error } = await supabase
      .from('sms_survey_answers')
      .select('session_id, question_id, parsed_value')
      .in('session_id', sessionIds.slice(i, i + answerChunk))
      .not('parsed_value', 'is', null)
    if (error) throw error
    for (const a of (data ?? []) as Array<{
      session_id: number
      question_id: number
      parsed_value: string
    }>) {
      let m = answersBySession.get(a.session_id)
      if (!m) {
        m = new Map()
        answersBySession.set(a.session_id, m)
      }
      m.set(a.question_id, a.parsed_value)
    }
  }

  const orderedQuestions = [...questions].sort(
    (a, b) => a.sort_order - b.sort_order || a.question_id - b.question_id,
  )
  const receipts = sessions
    .map((s) => {
      const answers = answersBySession.get(s.session_id)
      const ordered = orderedQuestions
        .map((q) => {
          const value = answers?.get(q.question_id)
          return value != null ? { questionId: q.question_id, value } : null
        })
        .filter((a): a is { questionId: number; value: string } => a != null)
      return computeBallotReceipt(survey.receipt_salt, s.worker_id, ordered)
    })
    .sort()

  const roll = rollCount ?? 0
  return {
    turnout: {
      roll_count: roll,
      votes_cast: completedCount,
      turnout_pct: roll > 0 ? Math.round((completedCount / roll) * 1000) / 10 : 0,
    },
    tally: (tally ?? []) as VwSmsBallotTallyRow[],
    receipts,
    events: (events ?? []) as SmsBallotEventRow[],
  }
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

    let ballot: SmsBallotDetail | null = null
    if (survey.purpose === 'indicative_ballot' && survey.status !== 'draft') {
      ballot = await loadBallotDetail(
        supabase,
        survey,
        (questions ?? []) as SmsSurveyQuestionRow[],
        (funnel as { completed_count?: number } | null)?.completed_count ?? 0,
      )
    }

    // Never serve the receipt salt to clients (Phase 5): with the
    // salt, staff could brute-force receipt → member mappings.
    const { receipt_salt: _salt, ...surveySafe } = survey
    void _salt

    return NextResponse.json({
      survey: surveySafe,
      questions: questions ?? [],
      funnel: funnel ?? null,
      question_stats: questionStats ?? [],
      ballot,
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
        ? validateSurveyQuestions(body.questions, body.purpose ?? survey.purpose)
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
    if (body.purpose !== undefined) {
      update.purpose =
        body.purpose === 'indicative_ballot' ? 'indicative_ballot' : 'survey'
    }
    if (body.revote_policy !== undefined) {
      update.revote_policy =
        body.revote_policy === 'revote_until_close'
          ? 'revote_until_close'
          : 'locked'
    }
    if (body.results_restricted !== undefined) {
      update.results_restricted = !!body.results_restricted
    }
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
