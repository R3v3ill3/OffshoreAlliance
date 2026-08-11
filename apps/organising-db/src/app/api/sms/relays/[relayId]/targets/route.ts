/**
 * Relay targets (Phase 6): add / toggle-active.
 *
 * Targets are the external party's mobiles — staff-configured and
 * staff-visible, never exposed to members. Deactivating a target
 * stops BOTH directions on the next webhook: no more forwards to
 * it, and its texts stop bridging (they fall through to the member
 * leg). Hard deletes are deliberately not offered — the message log
 * references targets for attribution.
 *
 * sms_relay_targets is service-role-write-only: writes run on the
 * ADMIN client after the explicit requireRelayWriteAccess check.
 * Platform sms_numbers can never be targets (relay-ring guard).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { matchPhoneInList } from '@/lib/sms/relay-engine'
import { toE164 } from '@/lib/phone/normalise-phone'
import { requireRelayWriteAccess } from '@/lib/sms/relay-route-helpers'

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
    if (access.relay.status === 'ended') {
      return NextResponse.json(
        { error: 'Relay has ended and cannot be edited' },
        { status: 400 },
      )
    }

    const body = (await req.json()) as {
      phone_e164?: string
      display_name?: string | null
    }
    const e164 = toE164(body.phone_e164 ?? '')
    if (!e164) {
      return NextResponse.json(
        { error: 'Target phone is not a valid mobile' },
        { status: 400 },
      )
    }

    // Relay-ring guard: none of OUR sms_numbers — any purpose, any
    // status — may be a relay target (a platform number as a target
    // would loop relay traffic back into the webhook).
    const { data: allNumbers } = await supabase
      .from('sms_numbers')
      .select('number_id, phone_e164')
    if (matchPhoneInList(allNumbers ?? [], e164)) {
      return NextResponse.json(
        {
          error:
            'That number is one of our own SMS numbers — platform numbers cannot be relay targets',
        },
        { status: 400 },
      )
    }

    const { data: inserted, error } = await createAdminClient()
      .from('sms_relay_targets')
      .insert({
        relay_id: relayId,
        phone_e164: e164,
        display_name: body.display_name?.trim() || null,
      })
      .select('target_id')
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That number is already a target on this relay' },
          { status: 400 },
        )
      }
      throw error
    }

    return NextResponse.json({ target_id: inserted.target_id }, { status: 201 })
  } catch (error) {
    console.error('POST sms relay target error:', error)
    return errorResponse('Failed to add relay target', error)
  }
}

export async function PATCH(
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

    const body = (await req.json()) as {
      target_id?: number
      is_active?: boolean
      display_name?: string | null
    }
    if (body.target_id == null || !Number.isFinite(body.target_id)) {
      return NextResponse.json({ error: 'target_id is required' }, { status: 400 })
    }
    const updates: Record<string, unknown> = {}
    if (body.is_active !== undefined) updates.is_active = !!body.is_active
    if (body.display_name !== undefined) {
      updates.display_name = body.display_name?.trim() || null
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data: updated, error } = await createAdminClient()
      .from('sms_relay_targets')
      .update(updates)
      .eq('target_id', body.target_id)
      .eq('relay_id', relayId)
      .select('target_id')
    if (error) throw error
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH sms relay target error:', error)
    return errorResponse('Failed to update relay target', error)
  }
}
