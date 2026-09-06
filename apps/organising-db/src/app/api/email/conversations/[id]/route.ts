/** Email conversation detail, workflow actions, and cursor paging. */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

const ALLOWED_STATES = ['needs_message', 'messaged', 'needs_response', 'convo', 'closed', 'triage']
const MESSAGE_PAGE = 100
const UNIQUE_VIOLATION = '23505'

const CONVERSATION_SELECT = `
  conversation_id, worker_id, email_address, campaign_id, subject,
  original_subject, last_message_preview, state, assignee_user_id,
  claim_user_id, claimed_until, unread_count, last_message_at, last_inbound_at, last_outbound_at,
  graph_conversation_id, closed_at, created_at, updated_at,
  worker:workers(
    worker_id, first_name, last_name, preferred_name, email, occupation,
    email_status, email_opt_out, email_opt_out_at, email_opt_out_source,
    employer:employers(employer_id, employer_name),
    worksite:worksites(worksite_id, worksite_name)
  ),
  campaign:campaigns(campaign_id, name, campaign_type, status)
`

function asPositiveInt(value: string): number | null {
  const number = parseInt(value, 10)
  return Number.isFinite(number) && number > 0 ? number : null
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const conversationId = asPositiveInt(id)
    if (conversationId == null) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: conversation, error } = await supabase
      .from('email_conversations')
      .select(CONVERSATION_SELECT)
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (error) throw error
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const beforeRaw = req.nextUrl.searchParams.get('before')
    const before = beforeRaw ? asPositiveInt(beforeRaw) : null
    let messagesQuery = supabase
      .from('email_messages')
      .select(
        `message_id, conversation_id, direction, subject, body_text, body_html,
         from_email, to_email, provider_message_id, rfc_message_id,
         rfc_references, graph_message_id, send_id, sender_user_id, status,
         error, delivered_at, created_at`,
      )
      .eq('conversation_id', conversationId)
      .order('message_id', { ascending: false })
      .limit(MESSAGE_PAGE)
    if (before != null) messagesQuery = messagesQuery.lt('message_id', before)

    const { data: messageRows, error: messageError } = await messagesQuery
    if (messageError) throw messageError
    const messages = [...(messageRows ?? [])].reverse()
    const messageIds = messages.map((message) => message.message_id as number)

    const [notesResult, eventsResult, attachmentResult] = await Promise.all([
      supabase
        .from('email_conversation_notes')
        .select('note_id, conversation_id, author_user_id, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
      supabase
        .from('email_conversation_events')
        .select('event_id, conversation_id, actor_user_id, event_type, detail, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(250),
      messageIds.length > 0
        ? supabase
            .from('email_message_attachments')
            .select(
              `attachment_id, message_id, conversation_id, filename,
               content_type, byte_size, content_id, is_inline, created_at`,
            )
            .in('message_id', messageIds)
            .order('attachment_id', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (notesResult.error) throw notesResult.error
    if (eventsResult.error) throw eventsResult.error
    if (attachmentResult.error) throw attachmentResult.error

    const attachmentsByMessage = new Map<number, Record<string, unknown>[]>()
    for (const attachment of attachmentResult.data ?? []) {
      const messageId = attachment.message_id as number
      const rows = attachmentsByMessage.get(messageId) ?? []
      rows.push(attachment as Record<string, unknown>)
      attachmentsByMessage.set(messageId, rows)
    }
    const messagesWithAttachments = messages.map((message) => ({
      ...message,
      attachments: attachmentsByMessage.get(message.message_id as number) ?? [],
    }))

    const userIds = new Set<string>()
    if (typeof conversation.assignee_user_id === 'string') {
      userIds.add(conversation.assignee_user_id)
    }
    if (typeof conversation.claim_user_id === 'string') {
      userIds.add(conversation.claim_user_id)
    }
    for (const message of messages) {
      if (typeof message.sender_user_id === 'string') userIds.add(message.sender_user_id)
    }
    for (const note of notesResult.data ?? []) userIds.add(note.author_user_id as string)
    for (const event of eventsResult.data ?? []) {
      if (typeof event.actor_user_id === 'string') userIds.add(event.actor_user_id)
    }
    let userNames: Record<string, string> = {}
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', [...userIds])
      userNames = Object.fromEntries(
        (profiles ?? []).map((profile) => [
          profile.user_id,
          profile.display_name || 'Staff member',
        ]),
      )
    }

    let originatingSend: Record<string, unknown> | null = null
    if (conversation.worker_id != null && conversation.campaign_id != null) {
      const { data: send } = await supabase
        .from('email_send_log')
        .select(
          `send_id, created_at, send_method, delivered_at, bounced_at,
           first_open_at, open_count, click_count,
           draft:campaign_comms_drafts(subject, body, body_html)`,
        )
        .eq('worker_id', conversation.worker_id)
        .eq('campaign_id', conversation.campaign_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (send) {
        const relation = (send as Record<string, unknown>).draft
        const draft = Array.isArray(relation) ? relation[0] : relation
        originatingSend = {
          ...send,
          ...((draft as Record<string, unknown> | null) ?? {}),
          draft: undefined,
        }
      }
    }

    return NextResponse.json({
      conversation: {
        ...conversation,
        is_overdue:
          conversation.state === 'needs_response' &&
          conversation.last_inbound_at != null &&
          Date.parse(conversation.last_inbound_at) <
            Date.now() - 24 * 60 * 60 * 1000,
      },
      messages: messagesWithAttachments,
      has_more_messages: messages.length === MESSAGE_PAGE,
      notes: notesResult.data ?? [],
      events: eventsResult.data ?? [],
      user_names: userNames,
      originating_send: originatingSend,
    })
  } catch (error) {
    console.error('GET email/conversations/[id] error:', error)
    return errorResponse('Failed to load email conversation', error)
  }
}

interface PatchBody {
  action?:
    | 'assign'
    | 'close'
    | 'reopen'
    | 'mark_read'
    | 'attach'
    | 'match_worker'
    | 'set_opt_out'
  user_id?: string | null
  campaign_id?: number | null
  worker_id?: number
  opt_out?: boolean
  state?: string
  worker_email_opt_out?: boolean
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const conversationId = asPositiveInt(id)
    if (conversationId == null) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as PatchBody | null
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { data: conversation, error: conversationError } = await supabase
      .from('email_conversations')
      .select('conversation_id, worker_id, campaign_id, state, assignee_user_id')
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (conversationError) throw conversationError
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    if (conversation.campaign_id != null) {
      const { data: canWrite, error: permissionError } = await supabase.rpc(
        'can_write_to_campaign',
        { p_campaign_id: conversation.campaign_id },
      )
      if (permissionError) throw permissionError
      if (!canWrite) {
        return NextResponse.json(
          { error: 'You do not have permission to update this campaign conversation' },
          { status: 403 },
        )
      }
    }

    const action =
      body.action ??
      (typeof body.worker_email_opt_out === 'boolean'
        ? 'set_opt_out'
        : typeof body.state === 'string'
          ? body.state === 'closed'
            ? 'close'
            : 'reopen'
          : null)
    let updates: Record<string, unknown> | null = null
    let eventType:
      | 'assigned'
      | 'state_changed'
      | 'campaign_attached'
      | 'worker_matched'
      | 'opt_out_changed'
      | null = null
    let detail: Record<string, unknown> = {}

    switch (action) {
      case 'assign':
        updates = { assignee_user_id: body.user_id ?? null }
        eventType = 'assigned'
        detail = {
          from_user_id: conversation.assignee_user_id,
          to_user_id: body.user_id ?? null,
        }
        break
      case 'close':
        updates = {
          state: 'closed',
          unread_count: 0,
          closed_at: new Date().toISOString(),
          closed_by_user_id: user.id,
        }
        eventType = 'state_changed'
        detail = { from: conversation.state, to: 'closed' }
        break
      case 'reopen':
        updates = {
          state: 'needs_response',
          closed_at: null,
          closed_by_user_id: null,
        }
        eventType = 'state_changed'
        detail = { from: conversation.state, to: 'needs_response' }
        break
      case 'mark_read':
        updates = { unread_count: 0 }
        break
      case 'attach':
        if (
          body.campaign_id !== null &&
          (body.campaign_id == null || !Number.isFinite(body.campaign_id))
        ) {
          return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
        }
        updates = { campaign_id: body.campaign_id ?? null }
        eventType = 'campaign_attached'
        detail = {
          from_campaign_id: conversation.campaign_id,
          to_campaign_id: body.campaign_id ?? null,
        }
        break
      case 'match_worker': {
        if (body.worker_id == null || !Number.isFinite(body.worker_id)) {
          return NextResponse.json({ error: 'worker_id is required' }, { status: 400 })
        }
        const { data: worker } = await supabase
          .from('workers')
          .select('worker_id')
          .eq('worker_id', body.worker_id)
          .maybeSingle()
        if (!worker) return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
        updates = {
          worker_id: body.worker_id,
          state: conversation.state === 'triage' ? 'needs_response' : conversation.state,
        }
        eventType = 'worker_matched'
        detail = { from_worker_id: conversation.worker_id, to_worker_id: body.worker_id }
        break
      }
      case 'set_opt_out': {
        if (!conversation.worker_id) {
          return NextResponse.json(
            { error: 'Conversation has no linked worker' },
            { status: 400 },
          )
        }
        const optingOut = body.opt_out ?? body.worker_email_opt_out
        if (typeof optingOut !== 'boolean') {
          return NextResponse.json({ error: 'opt_out is required' }, { status: 400 })
        }
        const { error } = await supabase
          .from('workers')
          .update(
            optingOut
              ? {
                  email_opt_out: true,
                  email_opt_out_at: new Date().toISOString(),
                  email_opt_out_source: 'staff',
                }
              : {
                  email_opt_out: false,
                  email_opt_out_at: null,
                  email_opt_out_source: null,
                },
          )
          .eq('worker_id', conversation.worker_id)
        if (error) throw error
        eventType = 'opt_out_changed'
        detail = { opt_out: optingOut }
        break
      }
      default:
        if (typeof body.state === 'string' && ALLOWED_STATES.includes(body.state)) {
          updates = { state: body.state }
          eventType = 'state_changed'
          detail = { from: conversation.state, to: body.state }
          break
        }
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    let updated: Record<string, unknown> | null = null
    if (updates) {
      const result = await supabase
        .from('email_conversations')
        .update(updates)
        .eq('conversation_id', conversationId)
        .select(
          'conversation_id, worker_id, campaign_id, state, assignee_user_id, unread_count, closed_at',
        )
        .maybeSingle()
      if (result.error) {
        if (result.error.code === UNIQUE_VIOLATION) {
          return NextResponse.json(
            {
              error:
                'Another conversation for this email address already exists in that campaign.',
            },
            { status: 409 },
          )
        }
        throw result.error
      }
      updated = result.data as Record<string, unknown> | null
      if (!updated) {
        return NextResponse.json(
          { error: 'Conversation not found or no write access' },
          { status: 404 },
        )
      }
    }

    if (eventType) {
      const { error: eventError } = await supabase
        .from('email_conversation_events')
        .insert({
          conversation_id: conversationId,
          actor_user_id: user.id,
          event_type: eventType,
          detail,
        })
      if (eventError) {
        console.error('Email conversation event append failed:', eventError)
      }
    }

    return NextResponse.json(updated ?? { success: true })
  } catch (error) {
    console.error('PATCH email/conversations/[id] error:', error)
    return errorResponse('Failed to update email conversation', error)
  }
}
