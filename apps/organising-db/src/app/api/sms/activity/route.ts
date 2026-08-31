/**
 * GET /api/sms/activity — every blast, chat board and survey across
 * every campaign, for the SMS tools hub.
 *
 * The hub's Blasts / Surveys / Chats tabs were campaign-scoped panels
 * handed a null campaign, so with nothing selected they showed nothing
 * at all — no history, no way in. This is the whole-of-universe view
 * behind them: what has run, what is running, and where it lives.
 *
 * `?campaign_id=N` narrows to one campaign for the tabs' filter toggle.
 * Episode campaigns (the hidden per-send campaigns behind standalone
 * sends) are surfaced as "Standalone" rather than by their internal
 * name, which means nothing to an organiser.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

/** Newest first, capped — the hub is an overview, not an archive. */
const LIMIT = 200

export interface SmsActivityRow {
  id: number
  kind: 'blast' | 'chat' | 'survey'
  name: string
  status: string
  campaign_id: number | null
  campaign_name: string | null
  is_standalone: boolean
  created_at: string
  /** Blast/chat: people on the list. Survey: sessions created. */
  audience_count: number
  /** Blast/chat: messaged. Survey: completed. */
  progress_count: number
  /** Surveys only. */
  is_test?: boolean
  question_count?: number
}

interface CampaignRow {
  campaign_id: number
  name: string | null
  is_sms_episode: boolean | null
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = req.nextUrl.searchParams.get('campaign_id')
    const campaignId = raw ? parseInt(raw, 10) : null
    const scoped = Number.isFinite(campaignId)

    let listQuery = supabase
      .from('sms_lists')
      .select(
        'list_id, campaign_id, name, status, mode, created_at, total_items, sent_items, delivered_items',
      )
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    let surveyQuery = supabase
      .from('sms_surveys')
      .select('survey_id, campaign_id, title, status, is_test, created_at')
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    if (scoped) {
      listQuery = listQuery.eq('campaign_id', campaignId as number)
      surveyQuery = surveyQuery.eq('campaign_id', campaignId as number)
    }

    const [{ data: lists, error: lErr }, { data: surveys, error: sErr }] =
      await Promise.all([listQuery, surveyQuery])
    if (lErr) throw lErr
    if (sErr) throw sErr

    const listRows = (lists ?? []) as Array<{
      list_id: number
      campaign_id: number | null
      name: string | null
      status: string
      mode: string | null
      created_at: string
      total_items: number | null
      sent_items: number | null
      delivered_items: number | null
    }>
    const surveyRows = (surveys ?? []) as Array<{
      survey_id: number
      campaign_id: number | null
      title: string | null
      status: string
      is_test: boolean | null
      created_at: string
    }>

    // Campaign names in one read rather than a join per table.
    const campaignIds = [
      ...new Set(
        [...listRows, ...surveyRows]
          .map((r) => r.campaign_id)
          .filter((v): v is number => v != null),
      ),
    ]
    const campaignById = new Map<number, CampaignRow>()
    if (campaignIds.length > 0) {
      const { data: campaigns, error: cErr } = await supabase
        .from('campaigns')
        .select('campaign_id, name, is_sms_episode')
        .in('campaign_id', campaignIds)
      if (cErr) throw cErr
      for (const c of (campaigns ?? []) as CampaignRow[]) {
        campaignById.set(c.campaign_id, c)
      }
    }

    // Survey question and completion counts, batched.
    const surveyIds = surveyRows.map((s) => s.survey_id)
    const questionCount = new Map<number, number>()
    const sessionCount = new Map<number, number>()
    const completedCount = new Map<number, number>()
    if (surveyIds.length > 0) {
      const [{ data: qs }, { data: sess }] = await Promise.all([
        supabase
          .from('sms_survey_questions')
          .select('survey_id, retired_at')
          .in('survey_id', surveyIds),
        supabase
          .from('sms_survey_sessions')
          .select('survey_id, state')
          .in('survey_id', surveyIds),
      ])
      for (const q of (qs ?? []) as Array<{
        survey_id: number
        retired_at: string | null
      }>) {
        if (q.retired_at) continue
        questionCount.set(q.survey_id, (questionCount.get(q.survey_id) ?? 0) + 1)
      }
      for (const x of (sess ?? []) as Array<{
        survey_id: number
        state: string
      }>) {
        sessionCount.set(x.survey_id, (sessionCount.get(x.survey_id) ?? 0) + 1)
        if (x.state === 'completed') {
          completedCount.set(
            x.survey_id,
            (completedCount.get(x.survey_id) ?? 0) + 1,
          )
        }
      }
    }

    const describeCampaign = (id: number | null) => {
      const c = id != null ? campaignById.get(id) : undefined
      const isStandalone = !!c?.is_sms_episode
      return {
        campaign_id: id,
        // A hidden episode campaign's generated name is noise; what the
        // organiser knows is that the send was standalone.
        campaign_name: isStandalone ? null : (c?.name ?? null),
        is_standalone: isStandalone,
      }
    }

    const blasts: SmsActivityRow[] = []
    const chats: SmsActivityRow[] = []
    for (const l of listRows) {
      const row: SmsActivityRow = {
        id: l.list_id,
        kind: (l.mode ?? 'blast') === 'p2p' ? 'chat' : 'blast',
        name: l.name?.trim() || `Untitled ${l.mode === 'p2p' ? 'chat' : 'blast'}`,
        status: l.status,
        created_at: l.created_at,
        audience_count: l.total_items ?? 0,
        progress_count: (l.sent_items ?? 0) + (l.delivered_items ?? 0),
        ...describeCampaign(l.campaign_id),
      }
      if (row.kind === 'chat') chats.push(row)
      else blasts.push(row)
    }

    const surveyActivity: SmsActivityRow[] = surveyRows.map((s) => ({
      id: s.survey_id,
      kind: 'survey',
      name: s.title?.trim() || 'Untitled survey',
      status: s.status,
      created_at: s.created_at,
      audience_count: sessionCount.get(s.survey_id) ?? 0,
      progress_count: completedCount.get(s.survey_id) ?? 0,
      is_test: !!s.is_test,
      question_count: questionCount.get(s.survey_id) ?? 0,
      ...describeCampaign(s.campaign_id),
    }))

    return NextResponse.json({
      blasts,
      chats,
      surveys: surveyActivity,
      scoped,
    })
  } catch (error) {
    console.error('GET sms activity error:', error)
    return errorResponse('Failed to load SMS activity', error)
  }
}
