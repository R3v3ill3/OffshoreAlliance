/**
 * SMS relays (brief §6, Phase 6).
 *
 * GET  — relay rows (optional ?campaign_id= filter; org-wide relays
 *        — campaign_id NULL — are always included so a campaign's
 *        Relays tab shows everything that could touch its members),
 *        merged with the relay number, target counts and message /
 *        pending-moderation counts.
 * POST — create a relay (created 'paused'; explicit activation via
 *        the actions route): explicit can_write_to_campaign check
 *        when campaign-scoped, validates the number is an active
 *        spare-pool number with no live relay and that no target is
 *        a platform number currently routing traffic (a live relay or
 *        live survey session on it would ring / eat the reply — see
 *        lib/sms/relay-target-guard.ts), inserts the relay +
 *        targets via the ADMIN client (sms_relays/sms_relay_targets
 *        are service-role-write-only — the relay leg outranks
 *        conversational routing, so rows must be route-mediated),
 *        then claims the number via assign_sms_number(number,
 *        'relay') — admin-gated inside the RPC (brief §6: relays
 *        are admin-configured). RPC failure rolls the relay back.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { isValidTimeZone } from '@/lib/sms/blackout'
import { decideRelayTarget } from '@/lib/sms/relay-target-guard'
import { loadOwnNumberUsage } from '@/lib/sms/relay-runtime'
import { toE164 } from '@/lib/phone/normalise-phone'
import type { SmsRelayRow } from '@/types/sms'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const campaignRaw = req.nextUrl.searchParams.get('campaign_id')
    const campaignId = campaignRaw ? parseInt(campaignRaw, 10) : null

    let query = supabase
      .from('sms_relays')
      .select('*')
      .order('created_at', { ascending: false })
    if (campaignId != null && Number.isFinite(campaignId)) {
      query = query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
    }
    const { data: relaysRaw, error } = await query
    if (error) throw error
    const relays = (relaysRaw ?? []) as SmsRelayRow[]
    if (relays.length === 0) return NextResponse.json([])

    const relayIds = relays.map((r) => r.relay_id)
    const numberIds = [...new Set(relays.map((r) => r.number_id))]
    const [{ data: numbers }, { data: targets }, { data: pending }] =
      await Promise.all([
        supabase
          .from('sms_numbers')
          .select('number_id, phone_e164, label')
          .in('number_id', numberIds),
        supabase
          .from('sms_relay_targets')
          .select('relay_id, is_active')
          .in('relay_id', relayIds),
        supabase
          .from('sms_relay_messages')
          .select('relay_id')
          .in('relay_id', relayIds)
          .eq('moderation_status', 'pending'),
      ])

    const numberById = new Map(
      (numbers ?? []).map((n) => [n.number_id as number, n]),
    )
    const targetCounts = new Map<number, { total: number; active: number }>()
    for (const t of targets ?? []) {
      const rid = t.relay_id as number
      const c = targetCounts.get(rid) ?? { total: 0, active: 0 }
      c.total += 1
      if (t.is_active) c.active += 1
      targetCounts.set(rid, c)
    }
    const pendingCounts = new Map<number, number>()
    for (const p of pending ?? []) {
      const rid = p.relay_id as number
      pendingCounts.set(rid, (pendingCounts.get(rid) ?? 0) + 1)
    }

    return NextResponse.json(
      relays.map((r) => ({
        ...r,
        number: numberById.get(r.number_id) ?? null,
        target_count: targetCounts.get(r.relay_id)?.total ?? 0,
        active_target_count: targetCounts.get(r.relay_id)?.active ?? 0,
        pending_moderation_count: pendingCounts.get(r.relay_id) ?? 0,
      })),
    )
  } catch (error) {
    console.error('GET sms relays error:', error)
    return errorResponse('Failed to fetch SMS relays', error)
  }
}

interface CreateRelayBody {
  name?: string
  campaign_id?: number | null
  number_id?: number
  prefix_template?: string | null
  suffix_template?: string | null
  moderation_required?: boolean
  quiet_hours_respected?: boolean
  timezone?: string
  targets?: Array<{ phone_e164?: string; display_name?: string | null }>
}

export async function POST(req: NextRequest) {
  try {
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

    const body = (await req.json()) as CreateRelayBody
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (body.number_id == null || !Number.isFinite(body.number_id)) {
      return NextResponse.json(
        { error: 'A dedicated relay number is required' },
        { status: 400 },
      )
    }
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      return NextResponse.json(
        { error: `Invalid timezone "${body.timezone}"` },
        { status: 400 },
      )
    }
    const campaignId =
      body.campaign_id != null && Number.isFinite(body.campaign_id)
        ? body.campaign_id
        : null

    // Explicit campaign gate (the writes below run on the admin
    // client — RLS cannot be the check).
    if (campaignId != null) {
      const { data: canWrite, error: permErr } = await supabase.rpc(
        'can_write_to_campaign',
        { p_campaign_id: campaignId },
      )
      if (permErr) throw permErr
      if (!canWrite) {
        return NextResponse.json(
          { error: 'No write access to this campaign' },
          { status: 403 },
        )
      }
    }

    // Normalise + validate targets up front — a relay without a
    // reachable target list is still creatable (paused), but every
    // provided phone must parse.
    const targetRows: Array<{ phone_e164: string; display_name: string | null }> =
      []
    const seenPhones = new Set<string>()
    for (const t of body.targets ?? []) {
      const e164 = toE164(t.phone_e164 ?? '')
      if (!e164) {
        return NextResponse.json(
          { error: `Target phone "${t.phone_e164 ?? ''}" is not a valid mobile` },
          { status: 400 },
        )
      }
      if (seenPhones.has(e164)) continue
      seenPhones.add(e164)
      targetRows.push({
        phone_e164: e164,
        display_name: t.display_name?.trim() || null,
      })
    }

    // Own-number target guard. One of our own numbers may be a target
    // — that is how a relay gets tested end to end — but only while
    // nothing is routing on it: no live relay (the ring), no live
    // survey session (the reply would be read as a survey answer), and
    // never this relay's own number. See lib/sms/relay-target-guard.ts.
    const ownNumbers = await loadOwnNumberUsage(supabase)
    for (const t of targetRows) {
      const verdict = decideRelayTarget({
        phone: t.phone_e164,
        ownNumbers,
        relayNumberId: body.number_id,
      })
      if (!verdict.allowed) {
        return NextResponse.json({ error: verdict.reason }, { status: 400 })
      }
    }

    // The number must be active and in the spare pool (§7.0 — a
    // 'relay'-purpose number whose relay has ENDED counts as
    // returnable stock too). The partial unique index is the race
    // guard behind this check.
    const { data: numberRow } = await supabase
      .from('sms_numbers')
      .select('number_id, phone_e164, purpose, status')
      .eq('number_id', body.number_id)
      .maybeSingle()
    if (!numberRow || numberRow.status !== 'active') {
      return NextResponse.json(
        { error: 'Number not found or retired' },
        { status: 400 },
      )
    }
    if (numberRow.purpose !== 'spare' && numberRow.purpose !== 'relay') {
      return NextResponse.json(
        {
          error: `Number is assigned as '${numberRow.purpose}' — relays draw from the spare pool`,
        },
        { status: 400 },
      )
    }
    const { data: liveRelay } = await supabase
      .from('sms_relays')
      .select('relay_id')
      .eq('number_id', body.number_id)
      .neq('status', 'ended')
      .maybeSingle()
    if (liveRelay) {
      return NextResponse.json(
        { error: 'That number already carries a live relay' },
        { status: 400 },
      )
    }

    // Writes run on the ADMIN client — sms_relays/sms_relay_targets
    // are service-role-write-only (the explicit checks above are the
    // gate). The partial unique index turns a create race into 23505.
    const admin = createAdminClient()
    const { data: relay, error: relayErr } = await admin
      .from('sms_relays')
      .insert({
        campaign_id: campaignId,
        name: body.name.trim(),
        number_id: body.number_id,
        prefix_template: body.prefix_template?.trim() || null,
        suffix_template: body.suffix_template?.trim() || null,
        status: 'paused',
        moderation_required: !!body.moderation_required,
        quiet_hours_respected: body.quiet_hours_respected !== false,
        timezone: body.timezone || 'Australia/Perth',
        created_by: user.id,
      })
      .select('relay_id')
      .single()
    if (relayErr) {
      if (relayErr.code === '23505') {
        return NextResponse.json(
          { error: 'That number already carries a live relay' },
          { status: 400 },
        )
      }
      throw relayErr
    }

    // Claim the number for the relay via the USER client — the RPC
    // is admin-gated inside (brief §6: relays are admin-configured),
    // so the caller's own identity decides. Failure rolls the relay
    // back so no half-created relay squats on the number.
    const { error: assignErr } = await supabase.rpc('assign_sms_number', {
      p_number_id: body.number_id,
      p_purpose: 'relay',
    })
    if (assignErr) {
      const { error: rollbackErr } = await admin
        .from('sms_relays')
        .delete()
        .eq('relay_id', relay.relay_id)
      if (rollbackErr) {
        console.error(
          `Relay create rollback failed — orphaned paused relay ${relay.relay_id} on number ${body.number_id}:`,
          rollbackErr,
        )
      }
      return NextResponse.json(
        { error: `Could not claim the number: ${assignErr.message}` },
        { status: 403 },
      )
    }

    if (targetRows.length > 0) {
      const { error: targetErr } = await admin.from('sms_relay_targets').insert(
        targetRows.map((t) => ({ ...t, relay_id: relay.relay_id })),
      )
      if (targetErr) throw targetErr
    }

    return NextResponse.json({ relay_id: relay.relay_id }, { status: 201 })
  } catch (error) {
    console.error('POST sms relays error:', error)
    return errorResponse('Failed to create SMS relay', error)
  }
}
