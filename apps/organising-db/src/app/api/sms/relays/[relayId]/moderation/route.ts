/**
 * Relay moderation queue (Phase 6).
 *
 * GET  — pending member→target messages (oldest first).
 * POST — { relay_message_id, action: 'approve' | 'reject' }.
 *        approve: ('pending','held') → ('approved','queued'), then
 *        forward immediately when the relay is ACTIVE and its
 *        quiet-hours window is open (or not respected); otherwise
 *        the row waits in 'queued' for the timers cron at window
 *        open / relay resume. reject: ('rejected','rejected').
 *
 * sms_relay_messages has NO authenticated write policies — the
 * moderation flip happens on the ADMIN client after the explicit
 * campaign can-write check (the house service-role posture).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { getSmsProvider } from '@/lib/sms/provider'
import { isWithinSendWindow } from '@/lib/sms/blackout'
import { requireRelayWriteAccess } from '@/lib/sms/relay-route-helpers'
import {
  forwardRelayMessageNow,
  loadRelayTargets,
} from '@/lib/sms/relay-runtime'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ relayId: string }> },
) {
  try {
    const { relayId: relayIdRaw } = await params
    const relayId = parseInt(relayIdRaw, 10)
    if (!Number.isFinite(relayId)) {
      return NextResponse.json({ error: 'Invalid relay id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: pending, error } = await supabase
      .from('sms_relay_messages')
      .select('*')
      .eq('relay_id', relayId)
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: true })
    if (error) throw error

    return NextResponse.json(pending ?? [])
  } catch (error) {
    console.error('GET sms relay moderation error:', error)
    return errorResponse('Failed to fetch moderation queue', error)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ relayId: string }> },
) {
  try {
    const { relayId: relayIdRaw } = await params
    const relayId = parseInt(relayIdRaw, 10)
    if (!Number.isFinite(relayId)) {
      return NextResponse.json({ error: 'Invalid relay id' }, { status: 400 })
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

    const access = await requireRelayWriteAccess(supabase, relayId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }
    const relay = access.relay
    if (relay.status === 'ended') {
      return NextResponse.json(
        { error: 'Relay has ended — its queue can no longer be moderated' },
        { status: 400 },
      )
    }

    const body = (await req.json()) as {
      relay_message_id?: number
      action?: 'approve' | 'reject'
    }
    if (
      body.relay_message_id == null ||
      !Number.isFinite(body.relay_message_id) ||
      !body.action ||
      !['approve', 'reject'].includes(body.action)
    ) {
      return NextResponse.json(
        { error: 'relay_message_id and action (approve|reject) are required' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    if (body.action === 'reject') {
      const { data: updated, error } = await admin
        .from('sms_relay_messages')
        .update({
          moderation_status: 'rejected',
          forward_status: 'rejected',
          moderated_by: user.id,
          moderated_at: nowIso,
        })
        .eq('relay_message_id', body.relay_message_id)
        .eq('relay_id', relayId)
        .eq('moderation_status', 'pending')
        .select('relay_message_id')
      if (error) throw error
      if (!updated || updated.length === 0) {
        return NextResponse.json(
          { error: 'Message is not pending moderation' },
          { status: 400 },
        )
      }
      return NextResponse.json({ ok: true, moderation: 'rejected' })
    }

    // approve — the guarded flip is the claim: a double-click or a
    // second moderator loses the update and gets a 400.
    const { data: approved, error: approveErr } = await admin
      .from('sms_relay_messages')
      .update({
        moderation_status: 'approved',
        forward_status: 'queued',
        moderated_by: user.id,
        moderated_at: nowIso,
      })
      .eq('relay_message_id', body.relay_message_id)
      .eq('relay_id', relayId)
      .eq('moderation_status', 'pending')
      .select('relay_message_id, forwarded_body')
    if (approveErr) throw approveErr
    if (!approved || approved.length === 0) {
      return NextResponse.json(
        { error: 'Message is not pending moderation' },
        { status: 400 },
      )
    }

    // Forward now when the relay is active and its window allows;
    // otherwise the timers cron picks the 'queued' row up at window
    // open / relay resume.
    const windowOpen =
      !relay.quiet_hours_respected || isWithinSendWindow(new Date(), relay.timezone)
    if (relay.status !== 'active' || !windowOpen) {
      return NextResponse.json({
        ok: true,
        moderation: 'approved',
        forwarded: false,
        deferred: relay.status !== 'active' ? 'relay_not_active' : 'quiet_hours',
      })
    }

    const { data: numberRow } = await admin
      .from('sms_numbers')
      .select('number_id, phone_e164, status')
      .eq('number_id', relay.number_id)
      .maybeSingle()
    if (!numberRow || numberRow.status !== 'active') {
      return NextResponse.json({
        ok: true,
        moderation: 'approved',
        forwarded: false,
        deferred: 'number_unavailable',
      })
    }

    const provider = await getSmsProvider()
    const activeTargets = (await loadRelayTargets(admin, relayId)).filter(
      (t) => t.is_active,
    )
    const outcome = await forwardRelayMessageNow(admin, provider, {
      relayMessageId: body.relay_message_id,
      forwardedBody: (approved[0].forwarded_body as string | null) ?? '',
      senderDigits: (numberRow.phone_e164 as string).replace(/^\+/, ''),
      destinations: activeTargets,
    })

    return NextResponse.json({
      ok: true,
      moderation: 'approved',
      forwarded: outcome.sent > 0,
      forward_failed: outcome.sent === 0 ? (outcome.error ?? true) : undefined,
    })
  } catch (error) {
    console.error('POST sms relay moderation error:', error)
    return errorResponse('Failed to moderate relay message', error)
  }
}
