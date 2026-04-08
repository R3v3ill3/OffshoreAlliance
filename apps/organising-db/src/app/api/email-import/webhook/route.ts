import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

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
