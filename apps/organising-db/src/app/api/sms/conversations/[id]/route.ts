/**
 * Single SMS conversation.
 *
 * GET   — conversation + worker summary (employer via FK embed),
 *         messages (ascending, cursor-paged via ?before=<message_id>),
 *         internal notes, and a user_profiles display-name map for the
 *         staff UUIDs involved (assignee / escalation / claim / note
 *         authors / message senders).
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

    const beforeRaw = req.nextUrl.searchParams.get('before')
    const before = beforeRaw ? parseInt(beforeRaw, 10) : null
    let messagesQuery = supabase
      .from('sms_messages')
      .select(
        'message_id, conversation_id, direction, body, phone_e164, sender_user_id, provider_message_id, interaction_id, status, error, segments, created_at',
      )
      .eq('conversation_id', conversationId)
      .order('message_id', { ascending: false })
      .limit(MESSAGE_PAGE)
    if (before != null && Number.isFinite(before)) {
      messagesQuery = messagesQuery.lt('message_id', before)
    }
    const { data: messagesDesc, error: msgErr } = await messagesQuery
    if (msgErr) throw msgErr
    const messages = (messagesDesc ?? []).reverse()

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
      messages,
      has_more_messages: (messagesDesc ?? []).length === MESSAGE_PAGE,
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
