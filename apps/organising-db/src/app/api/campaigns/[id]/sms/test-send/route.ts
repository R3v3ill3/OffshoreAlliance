/**
 * Test-send-to-self (brief §3.1 item 9): send one SMS to an entered
 * number with merge fields resolved from SAMPLE_DATA, via the
 * configured provider (safe against the mock/sandbox in dev).
 *
 * Rate-limited; requires an active sender number. Deliberately does
 * NOT touch sms_send_log or sms_list_items — test sends are not
 * per-worker sends.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { withRateLimit, logRateLimitRequest } from '@/lib/rate-limit-middleware'
import { getSmsProvider } from '@/lib/sms/provider'
import { toE164 } from '@/lib/phone/normalise-phone'
import { resolveScriptVariables, SAMPLE_DATA } from '@/lib/comms/template-variables'
import { countSegments } from '@/lib/sms/segments'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { response } = await withRateLimit(req)
    if (response) return response

    const body = (await req.json()) as {
      to?: string
      body?: string
      sender_number_id?: number
    }
    const to = toE164(body.to ?? '')
    if (!to) {
      return NextResponse.json(
        { error: 'Enter a valid Australian mobile number' },
        { status: 400 },
      )
    }
    const messageBody = body.body?.trim()
    if (!messageBody) {
      return NextResponse.json({ error: 'Message body is empty' }, { status: 400 })
    }
    if (!body.sender_number_id) {
      return NextResponse.json(
        { error: 'Choose a sender number first' },
        { status: 400 },
      )
    }

    const { data: sender, error: senderErr } = await supabase
      .from('sms_numbers')
      .select('number_id, phone_e164, status')
      .eq('number_id', body.sender_number_id)
      .maybeSingle()
    if (senderErr) throw senderErr
    if (!sender || sender.status !== 'active') {
      return NextResponse.json(
        { error: 'Sender number is not active' },
        { status: 400 },
      )
    }

    // '[TEST] ' prefix: test sends skip the compliance validation, so
    // the copy must be visibly a test on the recipient's phone.
    const resolved = `[TEST] ${resolveScriptVariables(messageBody, SAMPLE_DATA)}`
    const segments = countSegments(resolved)

    const provider = await getSmsProvider()
    const [result] = await provider.sendBatch(
      [
        {
          to,
          body: resolved,
          // Mobile Message's sender field takes the dedicated number as
          // digits — E.164 without the '+'.
          sender: sender.phone_e164.replace(/^\+/, ''),
          customRef: `test:${user.id}`,
        },
      ],
      { idempotencyKey: `test-send:${user.id}:${Date.now()}` },
    )

    await logRateLimitRequest(req, 200)

    if (!result || result.status === 'error') {
      return NextResponse.json(
        { error: result?.error ?? 'Provider rejected the test send' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      status: result.status,
      provider_message_id: result.providerMessageId,
      segments: segments.segments,
      encoding: segments.encoding,
    })
  } catch (error) {
    console.error('POST sms test-send error:', error)
    return errorResponse('Failed to send test SMS', error)
  }
}
