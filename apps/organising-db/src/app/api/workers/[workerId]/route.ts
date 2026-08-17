/**
 * GET / PATCH /api/workers/[workerId] — the read and write path behind
 * WorkerChatCard (Phase 10, docs/SMS_MODULE_PHASE10_PLAN.md WI-9).
 *
 * Why a route rather than direct client Supabase calls (which is what
 * the wall chart's DetailsTab does): the SMS chat workspace edits
 * members from a surface where an organiser is working thirty people at
 * once. One audited, rate-limited, permission-checked path is worth
 * having, and GET collapses the six queries DetailsTab fires into one.
 *
 * Permission model:
 *   - With campaign_id: explicit can_write_to_campaign check. Callers
 *     from a campaign-scoped surface always send it.
 *   - Without: the workers table's own RLS policies apply under the
 *     user client. Never the service client — a worker edit is not a
 *     privileged operation.
 *
 * The audit row in worker_activity_log is best-effort: that table is
 * keyed connection_id NOT NULL, so it can only be written when a
 * worker_campaign_connections row already exists. We deliberately do
 * NOT create one — an edit is a correction, not a contact, and
 * inventing a connection would inflate contact counts. Same reasoning
 * as the SMS assessments route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { toE164 } from '@/lib/phone/normalise-phone'

const WORKER_SELECT = `
  worker_id, first_name, last_name, preferred_name, email, phone,
  phone_e164, occupation, canonical_occupation_id, employer_id,
  worksite_id, member_role_type_id, union_membership_type_id,
  non_oa_union_option_id, is_hsr, is_bargaining_rep, is_active,
  sms_opt_out, sms_opt_out_at, sms_opt_out_source,
  employer:employers(employer_id, employer_name),
  worksite:worksites(worksite_id, worksite_name),
  member_role_type:member_role_types(role_type_id, role_name, display_name),
  union_membership_type:union_membership_types(union_membership_type_id, type_name, display_name),
  canonical_occupation:occupations(occupation_id, canonical_name)
`

/**
 * Every field the card can write. All optional — the card sends only
 * what changed, so an absent key means "leave alone" and an explicit
 * null means "clear".
 */
const patchSchema = z.object({
  campaign_id: z.number().int().positive().nullable().optional(),
  /** Tags the audit row so a chat edit is traceable to its thread. */
  sms_conversation_id: z.number().int().positive().nullable().optional(),
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  preferred_name: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  occupation: z.string().trim().max(200).nullable().optional(),
  canonical_occupation_id: z.number().int().positive().nullable().optional(),
  employer_id: z.number().int().positive().nullable().optional(),
  worksite_id: z.number().int().positive().nullable().optional(),
  member_role_type_id: z.number().int().positive().nullable().optional(),
  union_membership_type_id: z.number().int().positive().nullable().optional(),
  non_oa_union_option_id: z.number().int().positive().nullable().optional(),
  is_hsr: z.boolean().optional(),
  is_bargaining_rep: z.boolean().optional(),
})

type PatchBody = z.infer<typeof patchSchema>

/** Columns that are worker fields, as opposed to request metadata. */
const WORKER_FIELDS = [
  'first_name',
  'last_name',
  'preferred_name',
  'email',
  'phone',
  'occupation',
  'canonical_occupation_id',
  'employer_id',
  'worksite_id',
  'member_role_type_id',
  'union_membership_type_id',
  'non_oa_union_option_id',
  'is_hsr',
  'is_bargaining_rep',
] as const satisfies readonly (keyof PatchBody)[]

function parseWorkerId(raw: string): number | null {
  const id = parseInt(raw, 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  try {
    const { workerId: rawId } = await params
    const workerId = parseWorkerId(rawId)
    if (workerId == null) {
      return NextResponse.json({ error: 'Invalid worker id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: worker, error } = await supabase
      .from('workers')
      .select(WORKER_SELECT)
      .eq('worker_id', workerId)
      .maybeSingle()
    if (error) throw error
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    return NextResponse.json({ worker })
  } catch (error) {
    console.error('GET workers/[workerId] error:', error)
    return errorResponse('Failed to load member', error)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  try {
    const { workerId: rawId } = await params
    const workerId = parseWorkerId(rawId)
    if (workerId == null) {
      return NextResponse.json({ error: 'Invalid worker id' }, { status: 400 })
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

    let body: PatchBody
    try {
      body = patchSchema.parse(await req.json())
    } catch (err) {
      const message =
        err instanceof z.ZodError
          ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : 'Invalid request body'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const campaignId = body.campaign_id ?? null

    // The SECURITY DEFINER-adjacent guard: RLS on `workers` is org-wide,
    // so a campaign-scoped caller gets an explicit check (same pattern
    // as the SMS assessments and messages routes).
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

    const { data: before, error: beforeErr } = await supabase
      .from('workers')
      .select(
        'worker_id, first_name, last_name, preferred_name, email, phone, phone_e164, occupation, canonical_occupation_id, employer_id, worksite_id, member_role_type_id, union_membership_type_id, non_oa_union_option_id, is_hsr, is_bargaining_rep',
      )
      .eq('worker_id', workerId)
      .maybeSingle()
    if (beforeErr) throw beforeErr
    if (!before) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}
    for (const field of WORKER_FIELDS) {
      if (field in body) updates[field] = body[field] ?? null
    }

    // Phone is stored twice: the raw entry and the normalised E.164 used
    // as the SMS routing key. Keep them in step, and refuse a number we
    // cannot normalise rather than silently writing an unroutable one.
    let phoneChanged = false
    if ('phone' in body) {
      const raw = body.phone?.trim() || null
      if (raw) {
        const e164 = toE164(raw)
        if (!e164) {
          return NextResponse.json(
            {
              error:
                'That does not look like an Australian mobile. Enter it as 04xx xxx xxx or +614xx xxx xxx.',
            },
            { status: 400 },
          )
        }
        updates.phone = raw
        updates.phone_e164 = e164
        phoneChanged = e164 !== before.phone_e164
      } else {
        updates.phone = null
        updates.phone_e164 = null
        phoneChanged = before.phone_e164 != null
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true })
    }

    const { data: after, error: updateErr } = await supabase
      .from('workers')
      .update(updates)
      .eq('worker_id', workerId)
      .select(WORKER_SELECT)
      .maybeSingle()
    if (updateErr) throw updateErr
    if (!after) {
      // RLS refused the update — the row exists (we read it above) but
      // this user may not write it.
      return NextResponse.json(
        { error: 'You do not have permission to edit this member' },
        { status: 403 },
      )
    }

    // What actually changed, for the audit row.
    const beforeRow = before as Record<string, unknown>
    const fieldDiff: Record<string, { from: unknown; to: unknown }> = {}
    for (const [field, value] of Object.entries(updates)) {
      if (beforeRow[field] !== value) {
        fieldDiff[field] = { from: beforeRow[field] ?? null, to: value }
      }
    }

    if (campaignId != null && Object.keys(fieldDiff).length > 0) {
      // Best-effort: worker_activity_log.connection_id is NOT NULL, so
      // this only lands where a connection already exists. We do not
      // create one — an edit is a correction, not a contact.
      const { data: connection } = await supabase
        .from('worker_campaign_connections')
        .select('connection_id')
        .eq('worker_id', workerId)
        .eq('campaign_id', campaignId)
        .maybeSingle()

      if (connection) {
        const { error: logErr } = await supabase
          .from('worker_activity_log')
          .insert({
            connection_id: connection.connection_id,
            activity_type: 'details_updated',
            description: body.sms_conversation_id
              ? 'Contact details updated from an SMS chat'
              : 'Contact details updated',
            outcome: 'details_updated',
            contact_method: body.sms_conversation_id ? 'sms' : null,
            metadata: {
              source: body.sms_conversation_id ? 'sms_chat' : 'worker_card',
              sms_conversation_id: body.sms_conversation_id ?? null,
              changes: fieldDiff,
            },
          })
        // An audit failure must not lose the organiser's edit.
        if (logErr) {
          console.error('worker_activity_log insert failed:', logErr)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      worker: after,
      /**
       * Signals that the SMS routing key moved. Existing conversations
       * are deliberately NOT re-keyed — a thread belongs to the number
       * it was sent to — so the card warns instead.
       */
      phone_e164_changed: phoneChanged,
    })
  } catch (error) {
    console.error('PATCH workers/[workerId] error:', error)
    return errorResponse('Failed to save member', error)
  }
}
