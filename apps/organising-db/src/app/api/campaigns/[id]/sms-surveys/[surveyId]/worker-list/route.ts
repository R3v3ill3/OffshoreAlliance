/**
 * POST /api/campaigns/[id]/sms-surveys/[surveyId]/worker-list —
 * "create list from responders" for a survey / indicative ballot
 * funnel (Phase 7, brief §3.1 item 11).
 *
 * Body: { cohort: 'completed' | 'started_not_completed' |
 *         'non_responders', name?: string }
 *
 * Cohorts are computed over the survey's sessions (frozen at open
 * time); 'non_responders' excludes opted_out sessions — see
 * lib/sms/reporting-cohorts.ts. Produces a DRAFT campaign_worker_list
 * usable by every channel. Membership only — no answers are copied,
 * so this is safe for restricted ballots too (belonging to a cohort
 * reveals participation, which the funnel already shows).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import {
  SURVEY_COHORT_LABELS,
  computeSurveyCohortWorkerIds,
  type SurveyCohort,
  type SurveyCohortSession,
} from '@/lib/sms/reporting-cohorts'

const PAGE_SIZE = 1000
const CHUNK_SIZE = 500

export async function POST(
  req: NextRequest,
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

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    const body = (await req.json()) as { cohort?: string; name?: string }
    const cohort = body.cohort as SurveyCohort
    if (!cohort || !(cohort in SURVEY_COHORT_LABELS)) {
      return NextResponse.json(
        {
          error:
            "cohort must be one of 'completed', 'started_not_completed', 'non_responders'",
        },
        { status: 400 },
      )
    }

    const { data: canWrite, error: permErr } = await supabase.rpc(
      'can_write_to_campaign',
      { p_campaign_id: cid },
    )
    if (permErr) throw permErr
    if (!canWrite) {
      return NextResponse.json(
        { error: 'No write access to this campaign' },
        { status: 403 },
      )
    }

    const { data: survey, error: surveyErr } = await supabase
      .from('sms_surveys')
      .select('survey_id, campaign_id, title, status')
      .eq('survey_id', sid)
      .maybeSingle()
    if (surveyErr) throw surveyErr
    if (!survey || survey.campaign_id !== cid) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    if (survey.status === 'draft') {
      return NextResponse.json(
        { error: 'This survey has not been opened yet — there are no sessions to segment.' },
        { status: 409 },
      )
    }

    const sessions: SurveyCohortSession[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sms_survey_sessions')
        .select('worker_id, state, first_answer_at')
        .eq('survey_id', sid)
        .order('session_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      sessions.push(...((data ?? []) as SurveyCohortSession[]))
      if (!data || data.length < PAGE_SIZE) break
    }

    const workerIds = computeSurveyCohortWorkerIds(sessions, cohort)
    if (workerIds.length === 0) {
      return NextResponse.json(
        { error: `No workers in the "${SURVEY_COHORT_LABELS[cohort]}" cohort yet.` },
        { status: 409 },
      )
    }

    const name =
      body.name?.trim() || `${survey.title} — ${SURVEY_COHORT_LABELS[cohort]}`
    const { data: workerList, error: createErr } = await supabase
      .from('campaign_worker_lists')
      .insert({
        campaign_id: cid,
        name: name.slice(0, 300),
        description: `Created from SMS survey "${survey.title}" (${SURVEY_COHORT_LABELS[cohort]} cohort).`,
        default_purpose: null,
        status: 'draft',
        source: 'sms_survey_cohort',
        created_by: user.id,
      })
      .select('list_id, name')
      .single()
    if (createErr) throw createErr

    for (let i = 0; i < workerIds.length; i += CHUNK_SIZE) {
      const { error } = await supabase.from('campaign_worker_list_items').insert(
        workerIds.slice(i, i + CHUNK_SIZE).map((workerId, j) => ({
          list_id: workerList.list_id,
          worker_id: workerId,
          sort_order: i + j,
        })),
      )
      if (error) throw error
    }

    return NextResponse.json(
      {
        list_id: workerList.list_id,
        name: workerList.name,
        items: workerIds.length,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST sms-surveys/[surveyId]/worker-list error:', error)
    return errorResponse('Failed to create worker list from survey cohort', error)
  }
}
