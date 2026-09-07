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
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getEmailProvider,
  getEmailSenderIdentity,
} from '@/lib/email/provider'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { errorResponse } from '@/lib/api/error-response'

const MAX_ATTACHMENTS = 8
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024

function safeFilename(name: string): string {
  return (
    name
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 180) || 'attachment'
  )
}

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

  const rateLimit = await checkRateLimit(req)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.reason ?? 'Rate limited' },
      { status: 429, headers: rateLimit.headers },
    )
  }

  const contentType = req.headers.get('content-type') ?? ''
  let bodyText = ''
  let requestedSubject = ''
  let attachments: File[] = []
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const body = form.get('body_text')
    const subject = form.get('subject')
    bodyText = typeof body === 'string' ? body.trim() : ''
    requestedSubject = typeof subject === 'string' ? subject.trim() : ''
    attachments = form
      .getAll('attachments')
      .filter((value): value is File => value instanceof File && value.size > 0)
  } else {
    const body = await req.json().catch(() => null)
    bodyText = typeof body?.body_text === 'string' ? body.body_text.trim() : ''
    requestedSubject = typeof body?.subject === 'string' ? body.subject.trim() : ''
  }
  if (!bodyText) {
    return NextResponse.json({ error: 'body_text required' }, { status: 400 })
  }
  if (bodyText.length > 100_000) {
    return NextResponse.json({ error: 'Reply body is too long' }, { status: 400 })
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `A maximum of ${MAX_ATTACHMENTS} attachments is allowed` },
      { status: 400 },
    )
  }
  const totalAttachmentBytes = attachments.reduce((sum, file) => sum + file.size, 0)
  if (
    attachments.some((file) => file.size > MAX_ATTACHMENT_BYTES) ||
    totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES
  ) {
    return NextResponse.json(
      {
        error:
          'Attachments must be no larger than 10 MB each and 20 MB in total',
      },
      { status: 400 },
    )
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('email_conversations')
    .select('conversation_id, email_address, subject, worker_id, campaign_id')
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (conversationError) {
    return errorResponse('Failed to authorize conversation reply', conversationError)
  }
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (conversation.campaign_id != null) {
    const { data: canWrite, error: permissionError } = await supabase.rpc(
      'can_write_to_campaign',
      { p_campaign_id: conversation.campaign_id },
    )
    if (permissionError) {
      return errorResponse('Failed to authorize conversation reply', permissionError)
    }
    if (!canWrite) {
      return NextResponse.json(
        { error: 'You do not have permission to reply for this campaign' },
        { status: 403 },
      )
    }
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
    .select('provider_message_id, rfc_message_id, rfc_references, subject')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const baseSubject =
    (lastInbound?.subject as string | null) ||
    (conversation.subject as string | null) ||
    '(no subject)'
  const subject =
    requestedSubject.slice(0, 500) ||
    (/^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`)
  const inReplyTo =
    (lastInbound?.rfc_message_id as string | null) ||
    (lastInbound?.provider_message_id as string | null) ||
    null
  const references = [
    (lastInbound?.rfc_references as string | null) ?? '',
    inReplyTo ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000)

  try {
    const [provider, sender] = await Promise.all([
      getEmailProvider(),
      getEmailSenderIdentity(),
    ])
    const bodyHtml = textToHtml(bodyText)
    const providerAttachments = await Promise.all(
      attachments.map(async (file) => ({
        content: Buffer.from(await file.arrayBuffer()).toString('base64'),
        filename: safeFilename(file.name),
        type: file.type || 'application/octet-stream',
        disposition: 'attachment' as const,
      })),
    )
    const results = await provider.sendBatch(
      [
        {
          to: conversation.email_address as string,
          subject,
          html: bodyHtml,
          text: bodyText,
          customArgs: { inbox_conversation_id: String(conversationId) },
          attachments: providerAttachments,
          headers: inReplyTo
            ? { 'In-Reply-To': inReplyTo, References: references || inReplyTo }
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
        rfc_references: references || null,
        sender_user_id: user.id,
        status: 'sent',
        created_at: sentAt,
      })
      .select('message_id')
      .single()
    const persistenceWarnings: string[] = []
    if (msgErr) {
      // The email left — surface the append failure without pretending
      // the send failed.
      console.error('email reply message append failed:', msgErr)
      persistenceWarnings.push('The sent message could not be appended to the inbox.')
    }

    const attachmentErrors: string[] = []
    if (message?.message_id && attachments.length > 0) {
      const admin = createAdminClient()
      for (const file of attachments) {
        const filename = safeFilename(file.name)
        const storagePath = `${conversationId}/${message.message_id}/${Date.now()}_${filename}`
        const bytes = Buffer.from(await file.arrayBuffer())
        const { error: uploadError } = await admin.storage
          .from('email-attachments')
          .upload(storagePath, bytes, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          })
        if (uploadError) {
          attachmentErrors.push(`${file.name}: ${uploadError.message}`)
          continue
        }
        const { error: metadataError } = await admin
          .from('email_message_attachments')
          .insert({
            message_id: message.message_id,
            conversation_id: conversationId,
            storage_bucket: 'email-attachments',
            storage_path: storagePath,
            filename: file.name.slice(0, 255),
            content_type: file.type || null,
            byte_size: file.size,
            created_by_user_id: user.id,
          })
        if (metadataError) {
          attachmentErrors.push(`${file.name}: ${metadataError.message}`)
          await admin.storage.from('email-attachments').remove([storagePath])
        }
      }
    }

    // 1:1 reply: thread becomes an active conversation, unread cleared.
    const { error: conversationUpdateError } = await supabase
      .from('email_conversations')
      .update({
        state: 'convo',
        unread_count: 0,
        last_message_at: sentAt,
        last_outbound_at: sentAt,
      })
      .eq('conversation_id', conversationId)
    if (conversationUpdateError) {
      console.error('email reply conversation update failed:', conversationUpdateError)
      persistenceWarnings.push('The conversation workflow state could not be updated.')
    }

    return NextResponse.json({
      success: true,
      message_id: message?.message_id ?? null,
      provider_message_id: result.providerMessageId,
      attachment_warnings: attachmentErrors,
      persistence_warnings: persistenceWarnings,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reply failed' },
      { status: 500 },
    )
  }
}
