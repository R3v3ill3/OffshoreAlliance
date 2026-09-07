/**
 * POST /api/sms/actions — archive, unarchive or delete an SMS action
 * (blast, chat board, survey, relay). Hub and campaign sheets share
 * this route so the guards cannot drift.
 *
 * GET  — inspect: whether the caller may archive/delete, pairing,
 *        lifecycle blocker, export href, facts warning.
 *
 * Body / query: kind, id, campaign_id (required except relays),
 * op (POST: archive | unarchive | delete), confirm (DELETE for
 * admin hard-delete of finished production work).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { requireStaffUser } from '@/lib/campaign/auth-api'
import { isSmsActionKind, type SmsActionKind } from '@/lib/sms/hub-actions'
import { requireRelayWriteAccess } from '@/lib/sms/relay-route-helpers'
import {
  archiveSmsAction,
  deleteSmsAction,
  inspectSmsAction,
  unarchiveSmsAction,
  type SmsActionActor,
  type SmsActionRefInput,
} from '@/lib/sms/archive-ops'

function parseRef(kindRaw: unknown, idRaw: unknown, campaignRaw: unknown): SmsActionRefInput | null {
  if (!isSmsActionKind(kindRaw)) return null
  const id = typeof idRaw === 'string' ? parseInt(idRaw, 10) : Number(idRaw)
  if (!Number.isInteger(id) || id <= 0) return null
  const campaignId =
    campaignRaw == null || campaignRaw === ''
      ? null
      : typeof campaignRaw === 'string'
        ? parseInt(campaignRaw, 10)
        : Number(campaignRaw)
  if (kindRaw !== 'relay') {
    if (campaignId == null || !Number.isInteger(campaignId) || campaignId <= 0) return null
    return { kind: kindRaw, id, campaignId }
  }
  return { kind: kindRaw, id, campaignId: campaignId && Number.isFinite(campaignId) ? campaignId : null }
}

async function assertWriteAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ref: SmsActionRefInput,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (ref.kind === 'relay') {
    const access = await requireRelayWriteAccess(supabase, ref.id)
    if (!access.ok) return { ok: false, status: access.status, error: access.error }
    return { ok: true }
  }
  const { data: canWrite, error } = await supabase.rpc('can_write_to_campaign', {
    p_campaign_id: ref.campaignId as number,
  })
  if (error) throw error
  if (!canWrite) {
    return { ok: false, status: 403, error: 'No write access to this campaign' }
  }
  return { ok: true }
}

function actorFromStaff(staff: { user: { id: string }; role: 'admin' | 'user' }): SmsActionActor {
  return { userId: staff.user.id, role: staff.role }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const staff = await requireStaffUser(supabase)
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ref = parseRef(
      req.nextUrl.searchParams.get('kind'),
      req.nextUrl.searchParams.get('id'),
      req.nextUrl.searchParams.get('campaign_id'),
    )
    if (!ref) {
      return NextResponse.json({ error: 'kind, id and campaign_id (except relays) are required' }, { status: 400 })
    }

    const inspect = await inspectSmsAction(supabase, actorFromStaff(staff), ref)
    if (!inspect) return NextResponse.json({ error: 'SMS action not found' }, { status: 404 })
    return NextResponse.json(inspect)
  } catch (error) {
    console.error('GET sms actions inspect error:', error)
    return errorResponse('Failed to inspect SMS action', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const staff = await requireStaffUser(supabase)
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    const body = (await req.json()) as {
      kind?: SmsActionKind
      id?: number
      campaign_id?: number
      op?: string
      confirm?: string
    }
    const ref = parseRef(body.kind, body.id, body.campaign_id)
    if (!ref) {
      return NextResponse.json({ error: 'kind, id and campaign_id (except relays) are required' }, { status: 400 })
    }
    if (!body.op || !['archive', 'unarchive', 'delete'].includes(body.op)) {
      return NextResponse.json({ error: 'op must be archive, unarchive or delete' }, { status: 400 })
    }

    const access = await assertWriteAccess(supabase, ref)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const admin = createAdminClient()
    const actor = actorFromStaff(staff)
    const result =
      body.op === 'archive'
        ? await archiveSmsAction(supabase, admin, actor, ref)
        : body.op === 'unarchive'
          ? await unarchiveSmsAction(supabase, admin, actor, ref)
          : await deleteSmsAction(supabase, admin, actor, ref, body.confirm)

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          lifecycle: result.lifecycle,
          needsTypedConfirm: result.needsTypedConfirm,
          code: result.code,
        },
        { status: result.status },
      )
    }
    return NextResponse.json({ ok: true, paired: result.paired })
  } catch (error) {
    console.error('POST sms actions error:', error)
    return errorResponse('Failed to update SMS action', error)
  }
}
