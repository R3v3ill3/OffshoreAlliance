/**
 * POST /api/sms/conversations/[id]/messages — send a 1:1 reply.
 *
 * Brief decision 6: one-to-one replies from the inbox are NEVER
 * blackout-blocked and carry no bulk compliance footer — the typed body
 * is sent exactly as written (trimmed). Everything else that guards a
 * bulk send still applies here:
 *   - auth + rate limit + campaign write access when the thread is
 *     campaign-scoped (org-wide triage threads only need auth),
 *   - the member's union-wide opt-out blocks sending (403; START or a
 *     staff restore lifts it),
 *   - sender = the conversation's own number (must be active) so the
 *     member keeps one continuous thread per organiser number.
 *
 * On success the message row is written through the USER client (the
 * RLS insert policy follows the conversation's write gate) and the
 * thread flips to 'convo' with unread cleared. A provider-side
 * 'blocked' result mirrors the worker opt-out flag (admin client —
 * compliance-critical) and records a failed message row.
 */
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { getSmsProvider } from '@/lib/sms/provider'
import { countSegments } from '@/lib/sms/segments'

const MAX_REPLY_CHARS = 1600

export async function POST(
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

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    const payload = (await req.json()) as { body?: string }
    const messageBody = payload.body?.trim()
    if (!messageBody) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }
    if (messageBody.length > MAX_REPLY_CHARS) {
      return NextResponse.json(
        { error: `Message is too long (max ${MAX_REPLY_CHARS} characters)` },
        { status: 400 },
      )
    }

    const { data: conversation, error: convErr } = await supabase
      .from('sms_conversations')
      .select('conversation_id, our_number_id, worker_id, phone_e164, campaign_id, state')
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (convErr) throw convErr
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Campaign-scoped threads require campaign write access; org-wide
    // (NULL campaign) triage threads are workable by any staff member.
    if (conversation.campaign_id != null) {
      const { data: canWrite, error: permErr } = await supabase.rpc(
        'can_write_to_campaign',
        { p_campaign_id: conversation.campaign_id },
      )
      if (permErr) throw permErr
      if (!canWrite) {
        return NextResponse.json(
          { error: 'No write access to this campaign' },
          { status: 403 },
        )
      }
    }

    // Union-wide opt-out check (brief §3.1 item 12) — a STOP means no
    // more messages, 1:1 included.
    if (conversation.worker_id != null) {
      const { data: worker } = await supabase
        .from('workers')
        .select('sms_opt_out')
        .eq('worker_id', conversation.worker_id)
        .maybeSingle()
      if (worker?.sms_opt_out) {
        return NextResponse.json(
          {
            error:
              'This member has opted out of SMS. They can text START to resubscribe.',
          },
          { status: 403 },
        )
      }
    }

    const { data: sender, error: senderErr } = await supabase
      .from('sms_numbers')
      .select('number_id, phone_e164, status')
      .eq('number_id', conversation.our_number_id)
      .maybeSingle()
    if (senderErr) throw senderErr
    if (!sender || sender.status !== 'active') {
      return NextResponse.json(
        { error: 'The conversation number is missing or retired' },
        { status: 409 },
      )
    }
    const senderDigits = (sender.phone_e164 as string).replace(/^\+/, '')

    const provider = await getSmsProvider()
    const sentAt = new Date().toISOString()
    const segments = countSegments(messageBody).segments
    let result
    try {
      const results = await provider.sendBatch(
        [
          {
            to: conversation.phone_e164,
            body: messageBody,
            sender: senderDigits,
            customRef: `conv-${conversationId}`,
          },
        ],
        { idempotencyKey: `sms-conv-${conversationId}-${randomUUID()}` },
      )
      result = results[0]
    } catch (sendErr) {
      const reason =
        sendErr instanceof Error ? sendErr.message : 'Provider send failed'
      return NextResponse.json({ error: reason }, { status: 502 })
    }

    const baseRow = {
      conversation_id: conversationId,
      direction: 'outbound',
      body: messageBody,
      phone_e164: conversation.phone_e164,
      sender_user_id: user.id,
      provider_message_id: result?.providerMessageId ?? null,
      segments,
      created_at: sentAt,
    }

    if (result?.status === 'success') {
      const { data: message, error: msgErr } = await supabase
        .from('sms_messages')
        .insert({ ...baseRow, status: 'sent' })
        .select('*')
        .single()
      if (msgErr) throw msgErr

      // 1:1 reply state transition (no counter arithmetic — plain
      // RLS-checked UPDATE): thread is now an active conversation.
      const { error: updErr } = await supabase
        .from('sms_conversations')
        .update({
          state: 'convo',
          unread_count: 0,
          last_message_at: sentAt,
          last_outbound_at: sentAt,
        })
        .eq('conversation_id', conversationId)
      if (updErr) throw updErr

      return NextResponse.json({ ok: true, message }, { status: 201 })
    }

    if (result?.status === 'blocked') {
      // Provider-side unsubscribe — mirror to the worker flag so every
      // later audience/reply check catches it (admin client: workers
      // consent writes are compliance-critical, never RLS-dependent).
      if (conversation.worker_id != null) {
        const admin = createAdminClient()
        await admin
          .from('workers')
          .update({
            sms_opt_out: true,
            sms_opt_out_at: sentAt,
            sms_opt_out_source: 'inbound_stop',
          })
          .eq('worker_id', conversation.worker_id)
          .eq('sms_opt_out', false)
      }
      await supabase
        .from('sms_messages')
        .insert({
          ...baseRow,
          status: 'failed',
          error: 'Recipient unsubscribed at provider',
        })
      return NextResponse.json(
        { error: 'The recipient has unsubscribed at the SMS provider.' },
        { status: 409 },
      )
    }

    const reason = result?.error ?? 'Provider send failed'
    await supabase
      .from('sms_messages')
      .insert({ ...baseRow, status: 'failed', error: reason })
    return NextResponse.json({ error: reason }, { status: 502 })
  } catch (error) {
    console.error('POST sms/conversations/[id]/messages error:', error)
    return errorResponse('Failed to send reply', error)
  }
}
