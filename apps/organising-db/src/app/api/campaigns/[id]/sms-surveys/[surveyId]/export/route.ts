/**
 * GET /api/campaigns/[id]/sms-surveys/[surveyId]/export — survey
 * answers export, CSV (Phase 7). Long format: one row per (session,
 * answered question), plus a single answerless row for sessions with
 * no parsed answers, so the funnel states are visible in the same file.
 *
 * Results-restricted ballots are 403'd: their ONLY reporting surface
 * is the aggregate tally (Phase 5 rule) — a per-member answer export
 * would defeat it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireStaffUser } from '@/lib/campaign/auth-api'
import { errorResponse } from '@/lib/api/error-response'
import { csvResponse } from '@/lib/api/csv'

const PAGE_SIZE = 1000
const CHUNK_SIZE = 500

interface SessionRow {
  session_id: number
  worker_id: number
  phone_e164: string
  state: string
  invited_at: string | null
  first_answer_at: string | null
  completed_at: string | null
}

interface AnswerRow {
  session_id: number
  question_id: number
  parsed_value: string | null
  raw_body: string | null
  invalid_attempts: number
  received_at: string
}

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
    const staff = await requireStaffUser(supabase)
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: survey, error: surveyErr } = await supabase
      .from('sms_surveys')
      .select('survey_id, campaign_id, title, purpose, results_restricted')
      .eq('survey_id', sid)
      .maybeSingle()
    if (surveyErr) throw surveyErr
    if (!survey || survey.campaign_id !== cid) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    if (survey.purpose === 'indicative_ballot' && survey.results_restricted) {
      return NextResponse.json(
        {
          error:
            'This ballot is results-restricted — per-member answers cannot be exported. The aggregate tally in the ballot report is the reporting surface.',
        },
        { status: 403 },
      )
    }

    const { data: questions, error: qErr } = await supabase
      .from('sms_survey_questions')
      .select('question_id, sort_order, prompt, qtype')
      .eq('survey_id', sid)
      .order('sort_order', { ascending: true })
      .order('question_id', { ascending: true })
    if (qErr) throw qErr
    const questionByIdx = new Map(
      (questions ?? []).map((q, i) => [q.question_id, { ...q, number: i + 1 }]),
    )

    const sessions: SessionRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sms_survey_sessions')
        .select(
          'session_id, worker_id, phone_e164, state, invited_at, first_answer_at, completed_at',
        )
        .eq('survey_id', sid)
        .order('session_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      sessions.push(...((data ?? []) as SessionRow[]))
      if (!data || data.length < PAGE_SIZE) break
    }

    // Worker names (chunked lookups).
    const workerName = new Map<number, string>()
    const workerIds = [...new Set(sessions.map((s) => s.worker_id))]
    for (let i = 0; i < workerIds.length; i += CHUNK_SIZE) {
      const { data, error } = await supabase
        .from('workers')
        .select('worker_id, first_name, last_name')
        .in('worker_id', workerIds.slice(i, i + CHUNK_SIZE))
      if (error) throw error
      for (const w of (data ?? []) as Array<{
        worker_id: number
        first_name: string
        last_name: string
      }>) {
        workerName.set(w.worker_id, `${w.first_name} ${w.last_name}`.trim())
      }
    }

    // Answers (chunked by session so a full chunk × questions stays
    // under the PostgREST row cap — same maths as the ballot receipts).
    const answersBySession = new Map<number, AnswerRow[]>()
    const sessionIds = sessions.map((s) => s.session_id)
    const answerChunk = Math.max(
      1,
      Math.floor(PAGE_SIZE / Math.max(1, (questions ?? []).length)),
    )
    for (let i = 0; i < sessionIds.length; i += answerChunk) {
      const { data, error } = await supabase
        .from('sms_survey_answers')
        .select(
          'session_id, question_id, parsed_value, raw_body, invalid_attempts, received_at',
        )
        .in('session_id', sessionIds.slice(i, i + answerChunk))
      if (error) throw error
      for (const a of (data ?? []) as AnswerRow[]) {
        const arr = answersBySession.get(a.session_id) ?? []
        arr.push(a)
        answersBySession.set(a.session_id, arr)
      }
    }

    const rows: Record<string, unknown>[] = []
    for (const s of sessions) {
      const base = {
        session_id: s.session_id,
        worker_id: s.worker_id,
        worker_name: workerName.get(s.worker_id) ?? `#${s.worker_id}`,
        phone_e164: s.phone_e164,
        session_state: s.state,
        invited_at: s.invited_at,
        first_answer_at: s.first_answer_at,
        completed_at: s.completed_at,
      }
      const answers = (answersBySession.get(s.session_id) ?? []).sort(
        (a, b) =>
          (questionByIdx.get(a.question_id)?.number ?? 0) -
          (questionByIdx.get(b.question_id)?.number ?? 0),
      )
      if (answers.length === 0) {
        rows.push({
          ...base,
          question_no: null,
          question: null,
          qtype: null,
          parsed_value: null,
          raw_body: null,
          invalid_attempts: null,
          received_at: null,
        })
        continue
      }
      for (const a of answers) {
        const q = questionByIdx.get(a.question_id)
        rows.push({
          ...base,
          question_no: q?.number ?? null,
          question: q?.prompt ?? `#${a.question_id}`,
          qtype: q?.qtype ?? null,
          parsed_value: a.parsed_value,
          raw_body: a.raw_body,
          invalid_attempts: a.invalid_attempts,
          received_at: a.received_at,
        })
      }
    }

    return csvResponse(rows, `sms-survey-${sid}-campaign-${cid}`)
  } catch (error) {
    console.error('GET sms-surveys/[surveyId]/export error:', error)
    return errorResponse('Failed to export SMS survey answers', error)
  }
}
