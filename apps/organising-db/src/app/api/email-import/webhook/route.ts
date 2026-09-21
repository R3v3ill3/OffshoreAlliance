import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseMembershipUpdateFilename } from '@/lib/membership-updates/kinds'
import {
  finaliseBatchIfComplete,
  ingestMembershipUpdateFile,
} from '@/lib/membership-updates/ingest'
import {
  hasDedicatedMembershipInbox,
  shouldFileAsMembershipUpdate,
} from '@/lib/membership-updates/inbox'

// Attachment downloads for the weekly membership files can take a while.
export const maxDuration = 120

interface InboundAttachment {
  id: string
  filename: string
  size?: number
  content_type?: string
  download_url: string
}

/**
 * Weekly membership spreadsheets ("OA - <Kind> Members - w-e DD-MM-YYYY.xlsx")
 * are filed as a membership update batch rather than a template import.
 * Returns null when the email carries none of them.
 */
async function fileMembershipUpdateAttachments(
  resend: Resend,
  supabase: ReturnType<typeof createAdminClient>,
  email: { email_id: string; from: string; subject: string },
): Promise<{ filed: number; batchIds: number[]; errors: string[] } | null> {
  const listed = await resend.emails.receiving.attachments.list({ emailId: email.email_id })
  const attachments = ((listed.data as unknown as { data?: InboundAttachment[] } | null)?.data ??
    (listed.data as unknown as InboundAttachment[] | null) ??
    []) as InboundAttachment[]
  const membershipFiles = attachments.filter((a) => parseMembershipUpdateFilename(a.filename ?? ''))
  if (membershipFiles.length === 0) return null

  const batchIds = new Set<number>()
  const errors: string[] = []
  let filed = 0
  for (const attachment of membershipFiles) {
    try {
      const response = await fetch(attachment.download_url)
      if (!response.ok) {
        errors.push(`${attachment.filename}: download failed (HTTP ${response.status})`)
        continue
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const result = await ingestMembershipUpdateFile(supabase, {
        filename: attachment.filename,
        buffer,
        source: {
          source: 'email',
          emailId: email.email_id,
          from: email.from,
          subject: email.subject,
          resendAttachmentId: attachment.id,
        },
      })
      if (result) {
        filed++
        batchIds.add(result.batchId)
      }
    } catch (err) {
      errors.push(`${attachment.filename}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  for (const batchId of batchIds) {
    try {
      await finaliseBatchIfComplete(supabase, batchId)
    } catch (err) {
      errors.push(`batch ${batchId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { filed, batchIds: [...batchIds], errors }
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')
  return new Resend(apiKey)
}

function parseSubjectTag(subject: string): string | null {
  const bracketMatch = subject.match(/\[([^\]]+)\]/)
  if (bracketMatch) return bracketMatch[1].trim().toLowerCase().replace(/\s+/g, '-')

  const fwdStripped = subject.replace(/^(?:fwd?|re):\s*/i, '').trim()
  const dashMatch = fwdStripped.match(/^([a-z0-9-]+)\s*[-–—]\s/i)
  if (dashMatch) return dashMatch[1].trim().toLowerCase().replace(/\s+/g, '-')

  return null
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const rawBody = await req.text()

    const svixId = req.headers.get('svix-id') || ''
    const svixTimestamp = req.headers.get('svix-timestamp') || ''
    const svixSignature = req.headers.get('svix-signature') || ''

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 })
    }

    const resend = getResendClient()

    let event: { type: string; data: { email_id: string; from: string; to: string[]; subject: string; created_at: string } }
    try {
      event = await resend.webhooks.verify({
        payload: rawBody,
        headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
        webhookSecret,
      }) as typeof event
    } catch {
      console.error('Webhook signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    if (event.type !== 'email.received') {
      return NextResponse.json({ ok: true, skipped: event.type })
    }

    const { email_id, from, to, subject } = event.data

    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('email_imports')
      .select('import_id')
      .eq('resend_email_id', email_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ ok: true, deduplicated: true })
    }

    // Dedicated inbox (NEXT_PUBLIC_MEMBERSHIP_UPDATE_INBOX different from
    // templates@): only mail To: that address is filed as a weekly update.
    // While they still share templates@, filename routing stays on.
    if (shouldFileAsMembershipUpdate(to)) {
      try {
        const membership = await fileMembershipUpdateAttachments(resend, supabase, {
          email_id,
          from,
          subject,
        })
        if (membership) {
          if (membership.errors.length > 0) {
            console.error('Membership update attachments had errors:', membership.errors)
          }
          return NextResponse.json({
            ok: true,
            email_id,
            membership_update: {
              filed: membership.filed,
              batch_ids: membership.batchIds,
              errors: membership.errors,
            },
          })
        }
        // Mail addressed to a dedicated membership inbox is never a template
        // forward, even when the attachments did not match the weekly names.
        if (hasDedicatedMembershipInbox()) {
          return NextResponse.json({
            ok: true,
            email_id,
            membership_update: { filed: 0, batch_ids: [], errors: [] },
          })
        }
      } catch (membershipErr) {
        // Fall through to the template import so the email is not lost.
        console.error('Membership update attachment check failed:', membershipErr)
      }
    }

    let bodyHtml: string | null = null
    let bodyText: string | null = null
    let rawHeaders: unknown = null
    try {
      const result = await resend.emails.receiving.get(email_id)
      const content = result.data as unknown as Record<string, unknown> | null
      if (content) {
        bodyHtml = (content.html as string) ?? null
        bodyText = (content.text as string) ?? null
        rawHeaders = content.headers ?? null
      }
    } catch (fetchErr) {
      console.error('Failed to fetch email content from Resend:', fetchErr)
    }

    const subjectTag = parseSubjectTag(subject)

    const { error: insertError } = await supabase
      .from('email_imports')
      .insert({
        resend_email_id: email_id,
        from_address: from,
        to_address: Array.isArray(to) ? to.join(', ') : to,
        subject,
        subject_tag: subjectTag,
        body_html: bodyHtml,
        body_text: bodyText,
        raw_headers: rawHeaders,
        analysis_status: 'pending',
      })

    if (insertError) {
      console.error('Failed to insert email import:', insertError)
      return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, email_id, subject_tag: subjectTag })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
