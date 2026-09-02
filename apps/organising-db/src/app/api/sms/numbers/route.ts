/**
 * GET /api/sms/numbers — number allocations for the SMS hub.
 *
 * Every platform number (active and retired) with its purpose and
 * organiser, plus what is running on it: blasts and chat boards that
 * send from it, surveys that listen on it, the relay that claims it,
 * and how many inbox threads sit on it. Administration → SMS is where
 * numbers are added and reassigned (admin-only); this is the
 * organiser-facing read of who is using what, so a sender can be
 * chosen — or freed up — with the full picture.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { inboundCheckForPhone } from '@/lib/sms/sender-inbound'
import { loadProviderSenderCatalogue } from '@/lib/sms/sender-inbound-server'
import {
  smsActionStatusGroup,
  type SmsActionKind,
  type SmsActionStatusGroup,
} from '@/lib/sms/hub-actions'
import type { SmsActivityScope } from '@/app/api/sms/activity/route'

/** Per number, most recent first. Enough to show history without paging. */
const ACTIONS_PER_NUMBER = 25

export interface SmsNumberActionRef {
  kind: SmsActionKind
  id: number
  campaign_id: number | null
  campaign_name: string | null
  scope: SmsActivityScope
  name: string
  status: string
  group: SmsActionStatusGroup
  updated_at: string
}

export interface SmsNumberAllocationRow {
  number_id: number
  phone_e164: string
  label: string | null
  purpose: string
  organiser_id: number | null
  organiser_name: string | null
  status: string
  notes: string | null
  /** Whether replies to this number land in OA; null = provider not asked. */
  supports_inbound: boolean | null
  /** Running now: sending blasts, open boards, open surveys, active relays. */
  live: SmsNumberActionRef[]
  /** Set up but not running: drafts, paused sends, paused relays. */
  pending: SmsNumberActionRef[]
  /** Done, most recent first (capped). */
  finished: SmsNumberActionRef[]
  /** Total actions ever on this number (before the cap). */
  action_count: number
  conversations: { open: number; total: number }
}

export interface SmsNumbersResponse {
  numbers: SmsNumberAllocationRow[]
  organisers: Array<{ organiser_id: number; organiser_name: string }>
  /** Admins may reassign purpose / organiser and retire numbers. */
  can_manage: boolean
}

interface CampaignRow {
  campaign_id: number
  name: string | null
  is_sms_episode: boolean | null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [
      { data: profile },
      { data: numbers, error: nErr },
      { data: organisers, error: oErr },
    ] = await Promise.all([
      supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('sms_numbers')
        .select('number_id, phone_e164, label, purpose, organiser_id, status, notes')
        .order('status', { ascending: true })
        .order('number_id', { ascending: true }),
      supabase
        .from('organisers')
        .select('organiser_id, organiser_name')
        .eq('is_active', true)
        .order('organiser_name'),
    ])
    if (nErr) throw nErr
    if (oErr) throw oErr

    const numberRows = (numbers ?? []) as Array<{
      number_id: number
      phone_e164: string
      label: string | null
      purpose: string
      organiser_id: number | null
      status: string
      notes: string | null
    }>
    const organiserRows = (organisers ?? []) as Array<{
      organiser_id: number
      organiser_name: string
    }>
    const organiserById = new Map(organiserRows.map((o) => [o.organiser_id, o.organiser_name]))
    const numberIds = numberRows.map((n) => n.number_id)

    if (numberIds.length === 0) {
      return NextResponse.json({
        numbers: [],
        organisers: organiserRows,
        can_manage: profile?.role === 'admin',
      } satisfies SmsNumbersResponse)
    }

    const [
      { data: lists, error: lErr },
      { data: surveys, error: sErr },
      { data: relays, error: rErr },
      conversationCounts,
      providerCatalogue,
    ] = await Promise.all([
      supabase
        .from('sms_lists')
        .select('list_id, campaign_id, name, status, mode, sender_number_id, updated_at')
        .in('sender_number_id', numberIds)
        .order('updated_at', { ascending: false })
        .limit(1000),
      supabase
        .from('sms_surveys')
        .select('survey_id, campaign_id, title, status, sender_number_id, updated_at')
        .in('sender_number_id', numberIds)
        .order('updated_at', { ascending: false })
        .limit(1000),
      supabase
        .from('sms_relays')
        .select('relay_id, campaign_id, name, status, number_id, updated_at')
        .in('number_id', numberIds)
        .order('updated_at', { ascending: false })
        .limit(1000),
      // Head counts per number: numbers are few, threads are many.
      Promise.all(
        numberIds.map(async (id) => {
          const [{ count: total }, { count: open }] = await Promise.all([
            supabase
              .from('sms_conversations')
              .select('conversation_id', { count: 'exact', head: true })
              .eq('our_number_id', id),
            supabase
              .from('sms_conversations')
              .select('conversation_id', { count: 'exact', head: true })
              .eq('our_number_id', id)
              .neq('state', 'closed'),
          ])
          return [id, { total: total ?? 0, open: open ?? 0 }] as const
        }),
      ),
      loadProviderSenderCatalogue().catch((err: unknown) => {
        console.error('GET sms numbers: provider catalogue failed:', err)
        return null
      }),
    ])
    if (lErr) throw lErr
    if (sErr) throw sErr
    if (rErr) throw rErr

    const listRows = (lists ?? []) as Array<{
      list_id: number
      campaign_id: number | null
      name: string | null
      status: string
      mode: string | null
      sender_number_id: number | null
      updated_at: string
    }>
    const surveyRows = (surveys ?? []) as Array<{
      survey_id: number
      campaign_id: number | null
      title: string | null
      status: string
      sender_number_id: number | null
      updated_at: string
    }>
    const relayRows = (relays ?? []) as Array<{
      relay_id: number
      campaign_id: number | null
      name: string | null
      status: string
      number_id: number
      updated_at: string
    }>

    const campaignIds = [
      ...new Set(
        [...listRows, ...surveyRows, ...relayRows]
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
      for (const c of (campaigns ?? []) as CampaignRow[]) campaignById.set(c.campaign_id, c)
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
        campaign_name: isStandalone ? null : (c?.name ?? null),
        scope,
      }
    }

    const actionsByNumber = new Map<number, SmsNumberActionRef[]>()
    const push = (numberId: number | null, ref: SmsNumberActionRef) => {
      if (numberId == null) return
      const bucket = actionsByNumber.get(numberId) ?? []
      bucket.push(ref)
      actionsByNumber.set(numberId, bucket)
    }
    for (const l of listRows) {
      const kind: SmsActionKind = (l.mode ?? 'blast') === 'p2p' ? 'chat' : 'blast'
      push(l.sender_number_id, {
        kind,
        id: l.list_id,
        name: l.name?.trim() || `Untitled ${kind}`,
        status: l.status,
        group: smsActionStatusGroup(kind, l.status),
        updated_at: l.updated_at,
        ...describeCampaign(l.campaign_id, false),
      })
    }
    for (const s of surveyRows) {
      push(s.sender_number_id, {
        kind: 'survey',
        id: s.survey_id,
        name: s.title?.trim() || 'Untitled survey',
        status: s.status,
        group: smsActionStatusGroup('survey', s.status),
        updated_at: s.updated_at,
        ...describeCampaign(s.campaign_id, false),
      })
    }
    for (const r of relayRows) {
      push(r.number_id, {
        kind: 'relay',
        id: r.relay_id,
        name: r.name?.trim() || 'Untitled relay',
        status: r.status,
        group: smsActionStatusGroup('relay', r.status),
        updated_at: r.updated_at,
        ...describeCampaign(r.campaign_id, true),
      })
    }

    const conversationsByNumber = new Map(conversationCounts)
    const providerName = providerCatalogue?.providerName ?? 'mock'
    const providerSenders = providerCatalogue?.senders ?? []

    const rows: SmsNumberAllocationRow[] = numberRows.map((n) => {
      const actions = (actionsByNumber.get(n.number_id) ?? []).sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      )
      const supportsInbound =
        providerCatalogue == null
          ? null
          : providerName === 'mock'
            ? true
            : inboundCheckForPhone(n.phone_e164, providerSenders) === null
      return {
        number_id: n.number_id,
        phone_e164: n.phone_e164,
        label: n.label,
        purpose: n.purpose,
        organiser_id: n.organiser_id,
        organiser_name:
          n.organiser_id != null ? (organiserById.get(n.organiser_id) ?? null) : null,
        status: n.status,
        notes: n.notes,
        supports_inbound: supportsInbound,
        live: actions.filter((a) => a.group === 'live'),
        pending: actions.filter((a) => a.group === 'pending'),
        finished: actions.filter((a) => a.group === 'finished').slice(0, ACTIONS_PER_NUMBER),
        action_count: actions.length,
        conversations: conversationsByNumber.get(n.number_id) ?? { open: 0, total: 0 },
      }
    })

    return NextResponse.json({
      numbers: rows,
      organisers: organiserRows,
      can_manage: profile?.role === 'admin',
    } satisfies SmsNumbersResponse)
  } catch (error) {
    console.error('GET sms numbers error:', error)
    return errorResponse('Failed to load SMS numbers', error)
  }
}
