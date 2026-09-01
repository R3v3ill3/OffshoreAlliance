/**
 * Relay detail + settings (Phase 6).
 *
 * GET   — relay + number + targets + message log (latest 200, both
 *         directions) + pending-moderation queue.
 * PATCH — name / prefix_template / suffix_template /
 *         moderation_required / quiet_hours_respected /
 *         bridge_replies / confirmation_template / timezone.
 *         Status transitions live in ./actions (activate/pause/end),
 *         NOT here. sms_relays is service-role-write-only, so the
 *         update runs on the ADMIN client after the explicit
 *         requireRelayWriteAccess check.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { isValidTimeZone } from '@/lib/sms/blackout'
import { RELAY_CONFIRMATION_MAX_LENGTH } from '@/lib/sms/relay-engine'
import { requireRelayWriteAccess } from '@/lib/sms/relay-route-helpers'

const MESSAGE_LOG_LIMIT = 200

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

    const { data: relay, error } = await supabase
      .from('sms_relays')
      .select('*')
      .eq('relay_id', relayId)
      .maybeSingle()
    if (error) throw error
    if (!relay) {
      return NextResponse.json({ error: 'Relay not found' }, { status: 404 })
    }

    const [{ data: number }, { data: targets }, { data: messages }] =
      await Promise.all([
        supabase
          .from('sms_numbers')
          .select('number_id, phone_e164, label, purpose, status')
          .eq('number_id', relay.number_id)
          .maybeSingle(),
        supabase
          .from('sms_relay_targets')
          .select('*')
          .eq('relay_id', relayId)
          .order('target_id', { ascending: true }),
        supabase
          .from('sms_relay_messages')
          .select('*')
          .eq('relay_id', relayId)
          .order('created_at', { ascending: false })
          .limit(MESSAGE_LOG_LIMIT),
      ])

    // Worker names for the log (best effort).
    const workerIds = [
      ...new Set(
        (messages ?? [])
          .map((m) => m.member_worker_id as number | null)
          .filter((v): v is number => v != null),
      ),
    ]
    const workerNameById = new Map<number, string>()
    if (workerIds.length > 0) {
      const { data: workers } = await supabase
        .from('workers')
        .select('worker_id, first_name, last_name')
        .in('worker_id', workerIds)
      for (const w of workers ?? []) {
        workerNameById.set(
          w.worker_id as number,
          `${w.first_name ?? ''} ${w.last_name ?? ''}`.trim(),
        )
      }
    }

    return NextResponse.json({
      relay,
      number: number ?? null,
      targets: targets ?? [],
      messages: (messages ?? []).map((m) => ({
        ...m,
        member_name:
          m.member_worker_id != null
            ? (workerNameById.get(m.member_worker_id as number) ?? null)
            : null,
      })),
      pending: (messages ?? []).filter(
        (m) => m.moderation_status === 'pending',
      ),
    })
  } catch (error) {
    console.error('GET sms relay detail error:', error)
    return errorResponse('Failed to fetch relay', error)
  }
}

interface UpdateRelayBody {
  name?: string
  prefix_template?: string | null
  suffix_template?: string | null
  moderation_required?: boolean
  quiet_hours_respected?: boolean
  bridge_replies?: boolean
  confirmation_template?: string | null
  timezone?: string
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
    if (access.relay.status === 'ended') {
      return NextResponse.json(
        { error: 'Relay has ended and cannot be edited' },
        { status: 400 },
      )
    }

    const body = (await req.json()) as UpdateRelayBody
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      return NextResponse.json(
        { error: `Invalid timezone "${body.timezone}"` },
        { status: 400 },
      )
    }
    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    if (
      (body.confirmation_template?.trim().length ?? 0) >
      RELAY_CONFIRMATION_MAX_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `The member confirmation must be ${RELAY_CONFIRMATION_MAX_LENGTH} characters or fewer`,
        },
        { status: 400 },
      )
    }

    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.prefix_template !== undefined) {
      updates.prefix_template = body.prefix_template?.trim() || null
    }
    if (body.suffix_template !== undefined) {
      updates.suffix_template = body.suffix_template?.trim() || null
    }
    if (body.moderation_required !== undefined) {
      updates.moderation_required = !!body.moderation_required
    }
    if (body.quiet_hours_respected !== undefined) {
      updates.quiet_hours_respected = !!body.quiet_hours_respected
    }
    if (body.bridge_replies !== undefined) {
      updates.bridge_replies = !!body.bridge_replies
    }
    if (body.confirmation_template !== undefined) {
      // Distinct from prefix/suffix: '' is preserved rather than
      // collapsed to NULL, because here the two mean different things
      // — no confirmation at all, versus fall back to the default.
      updates.confirmation_template =
        body.confirmation_template === null
          ? null
          : body.confirmation_template.trim()
    }
    if (body.timezone !== undefined) updates.timezone = body.timezone
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { error: updateErr } = await createAdminClient()
      .from('sms_relays')
      .update(updates)
      .eq('relay_id', relayId)
    if (updateErr) throw updateErr

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH sms relay error:', error)
    return errorResponse('Failed to update relay', error)
  }
}
