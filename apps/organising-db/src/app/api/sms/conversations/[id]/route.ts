/**
 * Single SMS conversation.
 *
 * GET   — conversation + worker summary (employer via FK embed),
 *         messages (ascending, cursor-paged via ?before=<message_id>),
 *         internal notes, and a user_profiles display-name map for the
 *         staff UUIDs involved (assignee / escalation / claim / note
 *         authors / message senders).
 *
 *         Phase 3 context scoping (brief §7.3) via ?scope=:
 *           - conversation (default) — the native thread, unchanged.
 *           - activity  — native messages filtered to those linked to
 *             the attached activity (message.interaction_id →
 *             sms_interactions.activity_id), plus messages at/after the
 *             earliest linked one (attach time isn't stored — the first
 *             activity-linked message is the cut line).
 *           - campaign  — read-only merge of every conversation this
 *             worker has in the attached campaign.
 *           - all       — read-only merge of the worker's entire SMS
 *             history.
 *         Merged scopes add a conversation_labels map for provenance;
 *         notes stay native-thread-only.
 * PATCH — management actions: assign, escalate / de_escalate (sticky
 *         escalation inbox), close / reopen, attach (campaign/activity).
 *
 * User client throughout — RLS gates campaign-scoped writes via
 * can_write_to_campaign; NULL-campaign rows are org-wide triage
 * (writable by any authenticated staff member).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

const UNIQUE_VIOLATION = '23505'
const MESSAGE_PAGE = 100
/** Cap for the merged campaign / all-history scopes (newest first). */
const MERGED_MESSAGE_CAP = 200

type ThreadScope = 'conversation' | 'activity' | 'campaign' | 'all'

function parseScope(raw: string | null): ThreadScope | null {
  if (raw == null || raw === 'conversation') return 'conversation'
  if (raw === 'activity' || raw === 'campaign' || raw === 'all') return raw
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const conversationId = parseInt(id, 10)
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: conversation, error: convErr } = await supabase
      .from('sms_conversations')
      .select(
        `
        conversation_id, our_number_id, worker_id, phone_e164, campaign_id,
        activity_id, state, assignee_user_id, escalated_to_user_id,
        claim_user_id, claimed_until, unread_count, last_message_at,
        last_inbound_at, last_outbound_at, created_at, updated_at,
        worker:workers(
          worker_id, first_name, last_name, preferred_name, phone,
          phone_e164, occupation, sms_opt_out, sms_opt_out_at,
          sms_opt_out_source, employer:employers(employer_id, employer_name)
        ),
        our_number:sms_numbers(number_id, phone_e164, label, organiser_id),
        campaign:campaigns(campaign_id, name)
      `,
      )
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (convErr) throw convErr
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const scope = parseScope(req.nextUrl.searchParams.get('scope'))
    if (scope == null) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }
    if (scope === 'activity' && conversation.activity_id == null) {
      return NextResponse.json(
        { error: 'This conversation has no attached activity' },
        { status: 400 },
      )
    }
    if ((scope === 'campaign' || scope === 'all') && conversation.worker_id == null) {
      return NextResponse.json(
        { error: 'This conversation is not matched to a worker' },
        { status: 400 },
      )
    }
    if (scope === 'campaign' && conversation.campaign_id == null) {
      return NextResponse.json(
        { error: 'This conversation has no attached campaign' },
        { status: 400 },
      )
    }

    const MESSAGE_COLUMNS =
      'message_id, conversation_id, direction, body, phone_e164, sender_user_id, provider_message_id, interaction_id, status, error, segments, created_at'

    let messages: Record<string, unknown>[] = []
    let hasMore = false
    let conversationLabels: Record<number, string> = {}

    if (scope === 'conversation' || scope === 'activity') {
      const beforeRaw = req.nextUrl.searchParams.get('before')
      const before =
        scope === 'conversation' && beforeRaw ? parseInt(beforeRaw, 10) : null
      let messagesQuery = supabase
        .from('sms_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('message_id', { ascending: false })
        .limit(MESSAGE_PAGE)
      if (before != null && Number.isFinite(before)) {
        messagesQuery = messagesQuery.lt('message_id', before)
      }
      const { data: messagesDesc, error: msgErr } = await messagesQuery
      if (msgErr) throw msgErr
      messages = (messagesDesc ?? []).reverse()
      hasMore = (messagesDesc ?? []).length === MESSAGE_PAGE

      if (scope === 'activity') {
        // Interactions on the page that belong to the attached activity.
        const interactionIds = messages
          .map((m) => m.interaction_id as number | null)
          .filter((v): v is number => v != null)
        let linked = new Set<number>()
        if (interactionIds.length > 0) {
          const { data: linkedRows, error: linkErr } = await supabase
            .from('sms_interactions')
            .select('id')
            .in('id', interactionIds)
            .eq('activity_id', conversation.activity_id as number)
          if (linkErr) throw linkErr
          linked = new Set((linkedRows ?? []).map((r) => r.id as number))
        }
        // Cut line = the earliest activity-linked message ("messages
        // after attach" — attach time isn't stored).
        let cutoff: number | null = null
        for (const m of messages) {
          const iid = m.interaction_id as number | null
          if (iid != null && linked.has(iid)) {
            const t = Date.parse(m.created_at as string)
            if (cutoff == null || t < cutoff) cutoff = t
          }
        }
        messages = messages.filter((m) => {
          const iid = m.interaction_id as number | null
          if (iid != null && linked.has(iid)) return true
          return cutoff != null && Date.parse(m.created_at as string) >= cutoff
        })
      }
    } else {
      // Merged scopes: every conversation for this worker (campaign-
      // filtered for scope=campaign), newest MERGED_MESSAGE_CAP messages.
      let convQuery = supabase
        .from('sms_conversations')
        .select(
          `conversation_id, campaign_id,
           campaign:campaigns(name),
           our_number:sms_numbers(label, phone_e164)`,
        )
        .eq('worker_id', conversation.worker_id as number)
      if (scope === 'campaign') {
        convQuery = convQuery.eq('campaign_id', conversation.campaign_id as number)
      }
      const { data: convs, error: convsErr } = await convQuery
      if (convsErr) throw convsErr
      const convIds = (convs ?? []).map((c) => c.conversation_id as number)
      if (!convIds.includes(conversationId)) convIds.push(conversationId)

      conversationLabels = Object.fromEntries(
        (convs ?? []).map((c) => {
          const campaignRel = (c as Record<string, unknown>).campaign as
            | { name?: string }
            | { name?: string }[]
            | null
          const numberRel = (c as Record<string, unknown>).our_number as
            | { label?: string | null; phone_e164?: string }
            | { label?: string | null; phone_e164?: string }[]
            | null
          const campaign = Array.isArray(campaignRel) ? campaignRel[0] : campaignRel
          const num = Array.isArray(numberRel) ? numberRel[0] : numberRel
          const label =
            campaign?.name || num?.label || num?.phone_e164 || 'Conversation'
          return [c.conversation_id as number, label]
        }),
      )

      const { data: merged, error: mergedErr } = await supabase
        .from('sms_messages')
        .select(MESSAGE_COLUMNS)
        .in('conversation_id', convIds)
        .order('message_id', { ascending: false })
        .limit(MERGED_MESSAGE_CAP)
      if (mergedErr) throw mergedErr
      hasMore = (merged ?? []).length === MERGED_MESSAGE_CAP
      messages = (merged ?? []).sort((a, b) => {
        const diff =
          Date.parse(a.created_at as string) - Date.parse(b.created_at as string)
        return diff !== 0
          ? diff
          : (a.message_id as number) - (b.message_id as number)
      })
    }

    const { data: notes, error: notesErr } = await supabase
      .from('sms_conversation_notes')
      .select('note_id, conversation_id, author_user_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (notesErr) throw notesErr

    // Display names for every staff UUID in play (no FK to
    // user_profiles, so no embed — resolve in one .in()).
    const userIds = new Set<string>()
    for (const key of [
      'assignee_user_id',
      'escalated_to_user_id',
      'claim_user_id',
    ] as const) {
      const v = (conversation as Record<string, unknown>)[key]
      if (typeof v === 'string') userIds.add(v)
    }
    for (const m of messages) {
      if (m.sender_user_id) userIds.add(m.sender_user_id as string)
    }
    for (const n of notes ?? []) {
      if (n.author_user_id) userIds.add(n.author_user_id as string)
    }
    let userNames: Record<string, string> = {}
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', [...userIds])
      userNames = Object.fromEntries(
        (profiles ?? []).map((p) => [p.user_id, p.display_name]),
      )
    }

    return NextResponse.json({
      conversation,
      scope,
      messages,
      has_more_messages: hasMore,
      conversation_labels: conversationLabels,
      notes: notes ?? [],
      user_names: userNames,
    })
  } catch (error) {
    console.error('GET sms/conversations/[id] error:', error)
    return errorResponse('Failed to fetch conversation', error)
  }
}

interface PatchBody {
  action?: 'assign' | 'escalate' | 'de_escalate' | 'close' | 'reopen' | 'attach'
  user_id?: string | null
  campaign_id?: number | null
  activity_id?: number | null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const conversationId = parseInt(id, 10)
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as PatchBody
    let updates: Record<string, unknown>
    switch (body.action) {
      case 'assign':
        updates = { assignee_user_id: body.user_id ?? null }
        break
      case 'escalate':
        // Sticky: stays routed to the escalation inbox until cleared.
        updates = { escalated_to_user_id: body.user_id ?? user.id }
        break
      case 'de_escalate':
        updates = { escalated_to_user_id: null }
        break
      case 'close':
        updates = { state: 'closed', unread_count: 0 }
        break
      case 'reopen':
        updates = { state: 'needs_response' }
        break
      case 'attach': {
        updates = {}
        if (body.campaign_id !== undefined) updates.campaign_id = body.campaign_id
        if (body.activity_id !== undefined) updates.activity_id = body.activity_id
        if (Object.keys(updates).length === 0) {
          return NextResponse.json(
            { error: 'attach requires campaign_id and/or activity_id' },
            { status: 400 },
          )
        }
        // An attached activity must belong to the conversation's campaign
        // (post-update): the FK alone would allow cross-campaign attaches.
        if (body.activity_id != null) {
          const [{ data: activity }, { data: conv }] = await Promise.all([
            supabase
              .from('campaign_activities')
              .select('campaign_id')
              .eq('activity_id', body.activity_id)
              .maybeSingle(),
            supabase
              .from('sms_conversations')
              .select('campaign_id')
              .eq('conversation_id', conversationId)
              .maybeSingle(),
          ])
          const targetCampaign =
            body.campaign_id !== undefined ? body.campaign_id : conv?.campaign_id
          if (!activity || targetCampaign == null || activity.campaign_id !== targetCampaign) {
            return NextResponse.json(
              { error: 'activity_id must belong to the conversation campaign' },
              { status: 400 },
            )
          }
        }
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('sms_conversations')
      .update(updates)
      .eq('conversation_id', conversationId)
      .select('conversation_id, state, assignee_user_id, escalated_to_user_id, campaign_id, activity_id, unread_count')
      .maybeSingle()
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          {
            error:
              'A conversation for this number pair already exists in that campaign — open it instead.',
          },
          { status: 409 },
        )
      }
      throw error
    }
    if (!updated) {
      // RLS write gate (campaign-scoped) or missing row.
      return NextResponse.json(
        { error: 'Conversation not found or no write access' },
        { status: 404 },
      )
    }
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH sms/conversations/[id] error:', error)
    return errorResponse('Failed to update conversation', error)
  }
}
