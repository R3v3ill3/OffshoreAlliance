/**
 * Relay lifecycle actions (Phase 6): activate | pause | end.
 *
 * Status flips take effect on the NEXT webhook (brief §6) — no
 * queue surgery here. 'end' additionally releases the number back
 * to the spare pool via assign_sms_number(number,'spare') — the RPC
 * is admin-gated inside; when a campaign writer who is not an admin
 * ends a relay, the relay still ends (routing releases immediately
 * because the webhook only intercepts active|paused relays) and the
 * response carries number_released:false so the UI can surface the
 * follow-up for an admin.
 *
 * Activation requires at least one ACTIVE target — an active relay
 * with nobody to forward to would silently hold every message.
 *
 * sms_relays / sms_relay_messages are service-role-write-only:
 * status flips (and the end-time queue tidy-up) run on the ADMIN
 * client after the explicit requireRelayWriteAccess check.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { requireRelayWriteAccess } from '@/lib/sms/relay-route-helpers'

type RelayAction = 'activate' | 'pause' | 'end'

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

    const { action } = (await req.json()) as { action?: RelayAction }
    if (!action || !['activate', 'pause', 'end'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const access = await requireRelayWriteAccess(supabase, relayId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }
    const relay = access.relay

    if (relay.status === 'ended') {
      return NextResponse.json(
        { error: 'Relay has already ended' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    if (action === 'activate') {
      if (relay.status === 'active') return NextResponse.json({ ok: true })
      const { count } = await supabase
        .from('sms_relay_targets')
        .select('target_id', { count: 'exact', head: true })
        .eq('relay_id', relayId)
        .eq('is_active', true)
      if ((count ?? 0) === 0) {
        return NextResponse.json(
          { error: 'Add at least one active target before activating' },
          { status: 400 },
        )
      }
      const { error } = await admin
        .from('sms_relays')
        .update({ status: 'active' })
        .eq('relay_id', relayId)
        .eq('status', 'paused')
      if (error) throw error
      return NextResponse.json({ ok: true, status: 'active' })
    }

    if (action === 'pause') {
      const { error } = await admin
        .from('sms_relays')
        .update({ status: 'paused' })
        .eq('relay_id', relayId)
        .eq('status', 'active')
      if (error) throw error
      return NextResponse.json({ ok: true, status: 'paused' })
    }

    // end: flip first (routing releases on the next webhook), then
    // release the number to the spare pool.
    const { error: endErr } = await admin
      .from('sms_relays')
      .update({ status: 'ended' })
      .eq('relay_id', relayId)
      .in('status', ['active', 'paused'])
    if (endErr) throw endErr

    // Tidy the queue: an ended relay's undelivered rows must not sit
    // in a lying terminal 'queued' (the cron would never touch them
    // again) — park them 'held' and leave pending moderation rows
    // where they are (already 'held'). Logged for the audit trail.
    const { data: parked, error: parkErr } = await admin
      .from('sms_relay_messages')
      .update({ forward_status: 'held' })
      .eq('relay_id', relayId)
      .eq('forward_status', 'queued')
      .select('relay_message_id')
    if (parkErr) {
      console.error(`Relay ${relayId} end: queue tidy-up failed:`, parkErr)
    } else if (parked && parked.length > 0) {
      console.warn(
        `Relay ${relayId} ended with ${parked.length} undelivered queued ` +
          `message(s) parked as 'held' (ids ${parked
            .map((p) => p.relay_message_id)
            .join(', ')})`,
      )
    }

    let numberReleased = true
    const { error: assignErr } = await supabase.rpc('assign_sms_number', {
      p_number_id: relay.number_id,
      p_purpose: 'spare',
    })
    if (assignErr) {
      numberReleased = false
      console.warn(
        `Relay ${relayId} ended but number ${relay.number_id} not released:`,
        assignErr.message,
      )
    }
    return NextResponse.json({
      ok: true,
      status: 'ended',
      number_released: numberReleased,
    })
  } catch (error) {
    console.error('POST sms relay action error:', error)
    return errorResponse('Failed to update relay status', error)
  }
}
