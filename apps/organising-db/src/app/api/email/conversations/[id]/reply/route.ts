/**
 * POST /api/email/conversations/[id]/reply
 *
 * Staff reply from the in-app inbox, sent through the platform provider
 * (SendGrid) with correct threading headers (In-Reply-To / References
 * from the latest inbound Message-ID). The real mailbox keeps the
 * authoritative copy of the member's replies; ours go out via the
 * platform identity and are appended to the thread as outbound rows.
 *
 * Body: { body_text: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getEmailProvider,
  getEmailSenderIdentity,
} from '@/lib/email/provider'

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export async function POST(
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
  const bodyText = typeof body?.body_text === 'string' ? body.body_text.trim() : ''
  if (!bodyText) {
    return NextResponse.json({ error: 'body_text required' }, { status: 400 })
  }

  const { data: conversation } = await supabase
    .from('email_conversations')
    .select('conversation_id, email_address, subject, worker_id, campaign_id')
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Consent guard: replying 1:1 is a direct response, but respect a
  // staff/worker opt-out anyway — the inbox shows the toggle.
  if (conversation.worker_id) {
    const { data: worker } = await supabase
      .from('workers')
      .select('email_opt_out')
      .eq('worker_id', conversation.worker_id)
      .maybeSingle()
    if (worker?.email_opt_out) {
      return NextResponse.json(
        {
          error:
            'This worker has unsubscribed from email. Re-enable email for them first if they have asked to hear from us again.',
        },
        { status: 409 },
      )
    }
  }

  // Threading headers from the latest inbound message.
  const { data: lastInbound } = await supabase
    .from('email_messages')
    .select('provider_message_id, subject')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const baseSubject =
    (lastInbound?.subject as string | null) ||
    (conversation.subject as string | null) ||
    '(no subject)'
  const subject = /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`
  const inReplyTo = (lastInbound?.provider_message_id as string | null) ?? null

  try {
    const [provider, sender] = await Promise.all([
      getEmailProvider(),
      getEmailSenderIdentity(),
    ])
    const bodyHtml = textToHtml(bodyText)
    const results = await provider.sendBatch(
      [
        {
          to: conversation.email_address as string,
          subject,
          html: bodyHtml,
          text: bodyText,
          headers: inReplyTo
            ? { 'In-Reply-To': inReplyTo, References: inReplyTo }
            : undefined,
        },
      ],
      { from: sender },
    )
    const result = results[0]
    if (result?.status !== 'success') {
      return NextResponse.json(
        { error: result?.error ?? 'Provider send failed' },
        { status: 502 },
      )
    }

    const sentAt = new Date().toISOString()
    const { data: message, error: msgErr } = await supabase
      .from('email_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        from_email: sender.fromEmail,
        to_email: conversation.email_address,
        provider_message_id: result.providerMessageId,
        in_reply_to: inReplyTo,
        sender_user_id: user.id,
        status: 'sent',
        created_at: sentAt,
      })
      .select('message_id')
      .single()
    if (msgErr) {
      // The email left — surface the append failure without pretending
      // the send failed.
      console.error('email reply message append failed:', msgErr)
    }

    // 1:1 reply: thread becomes an active conversation, unread cleared.
    await supabase
      .from('email_conversations')
      .update({
        state: 'convo',
        unread_count: 0,
        last_message_at: sentAt,
        last_outbound_at: sentAt,
      })
      .eq('conversation_id', conversationId)

    return NextResponse.json({
      success: true,
      message_id: message?.message_id ?? null,
      provider_message_id: result.providerMessageId,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reply failed' },
      { status: 500 },
    )
  }
}
