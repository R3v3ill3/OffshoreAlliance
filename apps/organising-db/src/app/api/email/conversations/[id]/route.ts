/**
 * GET   /api/email/conversations/[id] — thread detail (messages oldest
 *        first); reading marks the thread read (unread_count → 0).
 * PATCH /api/email/conversations/[id] — state transitions
 *        ({ state: 'closed' | 'needs_response' | 'convo' }) and the
 *        staff email opt-out toggle for the linked worker
 *        ({ worker_email_opt_out: boolean }).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_STATES = ['needs_message', 'messaged', 'needs_response', 'convo', 'closed', 'triage']

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const conversationId = Number(id)
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conversation, error } = await supabase
    .from('email_conversations')
    .select(
      `conversation_id, worker_id, email_address, campaign_id, subject, state,
       unread_count, last_message_at, created_at,
       workers(worker_id, first_name, last_name, email, email_opt_out, email_opt_out_source),
       campaigns(campaign_id, name)`,
    )
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: messages, error: msgErr } = await supabase
    .from('email_messages')
    .select(
      'message_id, direction, subject, body_text, body_html, from_email, to_email, provider_message_id, send_id, sender_user_id, attachments, status, error, created_at',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  // Reading clears the unread badge (RLS-checked staff update).
  if ((conversation.unread_count as number) > 0) {
    await supabase
      .from('email_conversations')
      .update({ unread_count: 0 })
      .eq('conversation_id', conversationId)
  }

  return NextResponse.json({ conversation, messages: messages ?? [] })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const conversationId = Number(id)
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: conversation } = await supabase
    .from('email_conversations')
    .select('conversation_id, worker_id')
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (typeof body.state === 'string') {
    if (!ALLOWED_STATES.includes(body.state)) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }
    const { error } = await supabase
      .from('email_conversations')
      .update({ state: body.state })
      .eq('conversation_id', conversationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (typeof body.worker_email_opt_out === 'boolean') {
    if (!conversation.worker_id) {
      return NextResponse.json(
        { error: 'Conversation has no linked worker' },
        { status: 400 },
      )
    }
    const optingOut = body.worker_email_opt_out
    const { error } = await supabase
      .from('workers')
      .update(
        optingOut
          ? {
              email_opt_out: true,
              email_opt_out_at: new Date().toISOString(),
              email_opt_out_source: 'staff',
            }
          : { email_opt_out: false },
      )
      .eq('worker_id', conversation.worker_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
