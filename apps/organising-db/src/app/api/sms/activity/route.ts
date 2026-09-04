/**
 * GET /api/sms/activity — every blast, chat board, survey and relay
 * across every campaign, for the SMS hub.
 *
 * The hub is the whole-of-universe view: what has run, what is
 * running, where it lives and which number it sends from. Campaign
 * tabs show one campaign's slice through their own panels.
 *
 * `?campaign_id=N` narrows to one campaign (relays include org-wide
 * rows, which belong to every campaign). Episode campaigns (the
 * hidden per-send campaigns behind standalone actions) are surfaced
 * as "Standalone" rather than by their internal name.
 *
 * Blast rows carry `relay_id`/`relay_name` when the blast is a launch
 * text, so the table can say what it is and offer the relay.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import type { SmsActionKind } from '@/lib/sms/hub-actions'

/** Newest first, capped per kind — the hub is an overview, not an archive. */
const LIMIT = 200

export type SmsActivityScope = 'campaign' | 'standalone' | 'org'

export interface SmsActivityRow {
  id: number
  kind: SmsActionKind
  name: string
  status: string
  campaign_id: number | null
  campaign_name: string | null
  /** Where the action belongs. `org` = org-wide relay. */
  scope: SmsActivityScope
  /** Kept for older consumers; equals `scope === 'standalone'`. */
  is_standalone: boolean
  created_at: string
  updated_at: string
  /** The platform number the action sends (or listens) on. */
  sender_number_id: number | null
  sender_phone: string | null
  sender_label: string | null
  /** Blast/chat: people on the list. Survey: sessions created. Relay: targets. */
  audience_count: number
  /** Blast/chat: messaged. Survey: completed. Relay: active targets. */
  progress_count: number
  /** Surveys only. */
  is_test?: boolean
  question_count?: number
  /** Relays only. */
  pending_moderation_count?: number
  /** Blasts only: set when the blast is a launch text for a relay. */
  relay_id?: number | null
  relay_name?: string | null
}

export interface SmsActivityResponse {
  blasts: SmsActivityRow[]
  chats: SmsActivityRow[]
  surveys: SmsActivityRow[]
  relays: SmsActivityRow[]
  scoped: boolean
}

interface CampaignRow {
  campaign_id: number
  name: string | null
  is_sms_episode: boolean | null
}

interface NumberRow {
  number_id: number
  phone_e164: string
  label: string | null
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
    const scoped = campaignId != null && Number.isFinite(campaignId)

    let listQuery = supabase
      .from('sms_lists')
      .select(
        'list_id, campaign_id, name, status, mode, relay_id, created_at, updated_at, sender_number_id, total_items, sent_items, delivered_items',
      )
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    let surveyQuery = supabase
      .from('sms_surveys')
      .select(
        'survey_id, campaign_id, title, status, is_test, created_at, updated_at, sender_number_id',
      )
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    let relayQuery = supabase
      .from('sms_relays')
      .select('relay_id, campaign_id, name, status, number_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    if (scoped) {
      listQuery = listQuery.eq('campaign_id', campaignId as number)
      surveyQuery = surveyQuery.eq('campaign_id', campaignId as number)
      relayQuery = relayQuery.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
    }

    const [
      { data: lists, error: lErr },
      { data: surveys, error: sErr },
      { data: relays, error: rErr },
    ] = await Promise.all([listQuery, surveyQuery, relayQuery])
    if (lErr) throw lErr
    if (sErr) throw sErr
    if (rErr) throw rErr

    const listRows = (lists ?? []) as Array<{
      list_id: number
      campaign_id: number | null
      name: string | null
      status: string
      mode: string | null
      relay_id: number | null
      created_at: string
      updated_at: string
      sender_number_id: number | null
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
      updated_at: string
      sender_number_id: number | null
    }>
    const relayRows = (relays ?? []) as Array<{
      relay_id: number
      campaign_id: number | null
      name: string | null
      status: string
      number_id: number
      created_at: string
      updated_at: string
    }>

    // Campaign names and sender numbers in one read each rather than a
    // join per table.
    const campaignIds = [
      ...new Set(
        [...listRows, ...surveyRows, ...relayRows]
          .map((r) => r.campaign_id)
          .filter((v): v is number => v != null),
      ),
    ]
    const numberIds = [
      ...new Set(
        [
          ...listRows.map((r) => r.sender_number_id),
          ...surveyRows.map((r) => r.sender_number_id),
          ...relayRows.map((r) => r.number_id),
        ].filter((v): v is number => v != null),
      ),
    ]
    const relayIds = relayRows.map((r) => r.relay_id)
    const surveyIds = surveyRows.map((s) => s.survey_id)
    // Launch texts name their relay on the row. The relay may sit
    // outside this scope (an org-wide relay with a campaign blast), so
    // this is its own batched read rather than a lookup in relayRows.
    const launchRelayIds = [
      ...new Set(
        listRows.map((l) => l.relay_id).filter((v): v is number => v != null),
      ),
    ]

    const [
      { data: campaigns, error: cErr },
      { data: numbers, error: nErr },
      { data: targets },
      { data: pending },
      { data: qs },
      { data: sess },
      { data: launchRelays },
    ] = await Promise.all([
      campaignIds.length > 0
        ? supabase
            .from('campaigns')
            .select('campaign_id, name, is_sms_episode')
            .in('campaign_id', campaignIds)
        : Promise.resolve({ data: [] as CampaignRow[], error: null }),
      numberIds.length > 0
        ? supabase
            .from('sms_numbers')
            .select('number_id, phone_e164, label')
            .in('number_id', numberIds)
        : Promise.resolve({ data: [] as NumberRow[], error: null }),
      relayIds.length > 0
        ? supabase
            .from('sms_relay_targets')
            .select('relay_id, is_active')
            .in('relay_id', relayIds)
        : Promise.resolve({ data: [] as Array<{ relay_id: number; is_active: boolean }> }),
      relayIds.length > 0
        ? supabase
            .from('sms_relay_messages')
            .select('relay_id')
            .in('relay_id', relayIds)
            .eq('moderation_status', 'pending')
        : Promise.resolve({ data: [] as Array<{ relay_id: number }> }),
      surveyIds.length > 0
        ? supabase
            .from('sms_survey_questions')
            .select('survey_id, retired_at')
            .in('survey_id', surveyIds)
        : Promise.resolve({ data: [] as Array<{ survey_id: number; retired_at: string | null }> }),
      surveyIds.length > 0
        ? supabase
            .from('sms_survey_sessions')
            .select('survey_id, state')
            .in('survey_id', surveyIds)
        : Promise.resolve({ data: [] as Array<{ survey_id: number; state: string }> }),
      launchRelayIds.length > 0
        ? supabase
            .from('sms_relays')
            .select('relay_id, name')
            .in('relay_id', launchRelayIds)
        : Promise.resolve({ data: [] as Array<{ relay_id: number; name: string | null }> }),
    ])
    if (cErr) throw cErr
    if (nErr) throw nErr

    const campaignById = new Map<number, CampaignRow>()
    for (const c of (campaigns ?? []) as CampaignRow[]) campaignById.set(c.campaign_id, c)
    const numberById = new Map<number, NumberRow>()
    for (const n of (numbers ?? []) as NumberRow[]) numberById.set(n.number_id, n)

    const targetCounts = new Map<number, { total: number; active: number }>()
    for (const t of (targets ?? []) as Array<{ relay_id: number; is_active: boolean }>) {
      const c = targetCounts.get(t.relay_id) ?? { total: 0, active: 0 }
      c.total += 1
      if (t.is_active) c.active += 1
      targetCounts.set(t.relay_id, c)
    }
    const launchRelayName = new Map<number, string | null>()
    for (const r of (launchRelays ?? []) as Array<{
      relay_id: number
      name: string | null
    }>) {
      launchRelayName.set(r.relay_id, r.name)
    }
    const pendingCounts = new Map<number, number>()
    for (const p of (pending ?? []) as Array<{ relay_id: number }>) {
      pendingCounts.set(p.relay_id, (pendingCounts.get(p.relay_id) ?? 0) + 1)
    }
    const questionCount = new Map<number, number>()
    for (const q of (qs ?? []) as Array<{ survey_id: number; retired_at: string | null }>) {
      if (q.retired_at) continue
      questionCount.set(q.survey_id, (questionCount.get(q.survey_id) ?? 0) + 1)
    }
    const sessionCount = new Map<number, number>()
    const completedCount = new Map<number, number>()
    for (const x of (sess ?? []) as Array<{ survey_id: number; state: string }>) {
      sessionCount.set(x.survey_id, (sessionCount.get(x.survey_id) ?? 0) + 1)
      if (x.state === 'completed') {
        completedCount.set(x.survey_id, (completedCount.get(x.survey_id) ?? 0) + 1)
      }
    }

    const describeCampaign = (id: number | null, orgWideWhenNull: boolean) => {
      const c = id != null ? campaignById.get(id) : undefined
      const isStandalone = !!c?.is_sms_episode
      const scope: SmsActivityScope = isStandalone
        ? 'standalone'
        : id == null && orgWideWhenNull
          ? 'org'
          : 'campaign'
      return {
        campaign_id: id,
        // A hidden episode campaign's generated name is noise; what the
        // organiser knows is that the action was standalone.
        campaign_name: isStandalone ? null : (c?.name ?? null),
        scope,
        is_standalone: isStandalone,
      }
    }
    const describeNumber = (id: number | null) => {
      const n = id != null ? numberById.get(id) : undefined
      return {
        sender_number_id: id,
        sender_phone: n?.phone_e164 ?? null,
        sender_label: n?.label ?? null,
      }
    }

    const blasts: SmsActivityRow[] = []
    const chats: SmsActivityRow[] = []
    for (const l of listRows) {
      const kind: SmsActionKind = (l.mode ?? 'blast') === 'p2p' ? 'chat' : 'blast'
      const row: SmsActivityRow = {
        id: l.list_id,
        kind,
        name: l.name?.trim() || `Untitled ${kind === 'chat' ? 'chat' : 'blast'}`,
        status: l.status,
        created_at: l.created_at,
        updated_at: l.updated_at,
        audience_count: l.total_items ?? 0,
        progress_count: (l.sent_items ?? 0) + (l.delivered_items ?? 0),
        relay_id: l.relay_id,
        relay_name:
          l.relay_id != null ? (launchRelayName.get(l.relay_id) ?? null) : null,
        ...describeCampaign(l.campaign_id, false),
        ...describeNumber(l.sender_number_id),
      }
      if (kind === 'chat') chats.push(row)
      else blasts.push(row)
    }

    const surveyActivity: SmsActivityRow[] = surveyRows.map((s) => ({
      id: s.survey_id,
      kind: 'survey',
      name: s.title?.trim() || 'Untitled survey',
      status: s.status,
      created_at: s.created_at,
      updated_at: s.updated_at,
      audience_count: sessionCount.get(s.survey_id) ?? 0,
      progress_count: completedCount.get(s.survey_id) ?? 0,
      is_test: !!s.is_test,
      question_count: questionCount.get(s.survey_id) ?? 0,
      ...describeCampaign(s.campaign_id, false),
      ...describeNumber(s.sender_number_id),
    }))

    const relayActivity: SmsActivityRow[] = relayRows.map((r) => ({
      id: r.relay_id,
      kind: 'relay',
      name: r.name?.trim() || 'Untitled relay',
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      audience_count: targetCounts.get(r.relay_id)?.total ?? 0,
      progress_count: targetCounts.get(r.relay_id)?.active ?? 0,
      pending_moderation_count: pendingCounts.get(r.relay_id) ?? 0,
      ...describeCampaign(r.campaign_id, true),
      ...describeNumber(r.number_id),
    }))

    const payload: SmsActivityResponse = {
      blasts,
      chats,
      surveys: surveyActivity,
      relays: relayActivity,
      scoped,
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('GET sms activity error:', error)
    return errorResponse('Failed to load SMS activity', error)
  }
}
