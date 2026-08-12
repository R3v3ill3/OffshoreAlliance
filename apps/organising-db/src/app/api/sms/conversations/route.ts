/**
 * SMS inbox queue list + staff-initiated thread creation.
 *
 * GET /api/sms/conversations
 *   ?inbox=mine|needs_response|unassigned|triage|escalated|all
 *   &campaign_id=… &state=… &worker_id=… &search=… &limit=… &offset=…
 *
 * All access through the user client — reads are USING(true) for
 * authenticated staff (brief decision 4: staff organisers are the core
 * inbox scope). Every tab except `all` excludes closed threads; the
 * escalation inbox is sticky (escalated_to_user_id set, whatever the
 * state — brief §3.1 item 5). Search: digit-ish input matches the
 * member phone; anything else resolves worker names first.
 *
 * POST /api/sms/conversations — "Message this member": create-or-attach
 * a thread on the exact (our_number_id, phone_e164, campaign_id) key
 * (NULLS NOT DISTINCT) so an organiser can open a 1:1 chat without
 * waiting for an inbound. New threads start in state 'needs_message';
 * an existing thread on the key is returned as-is ({existing: true}).
 * Sender defaults to the requesting user's own organiser number
 * (organisers.email match, as the senders route does).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'

const UNIQUE_VIOLATION = '23505'

const INBOXES = [
  'mine',
  'needs_response',
  'unassigned',
  'triage',
  'escalated',
  'all',
] as const
type Inbox = (typeof INBOXES)[number]

const STATES = [
  'needs_message',
  'messaged',
  'needs_response',
  'convo',
  'closed',
  'triage',
]

const SELECT = `
  conversation_id, our_number_id, worker_id, phone_e164, campaign_id,
  activity_id, state, assignee_user_id, escalated_to_user_id,
  claim_user_id, claimed_until, unread_count, last_message_at,
  last_inbound_at, last_outbound_at, created_at, updated_at,
  worker:workers(worker_id, first_name, last_name, preferred_name),
  our_number:sms_numbers(number_id, phone_e164, label, organiser_id),
  campaign:campaigns(campaign_id, name)
`

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = req.nextUrl.searchParams
    const inboxRaw = params.get('inbox') ?? 'all'
    const inbox: Inbox = (INBOXES as readonly string[]).includes(inboxRaw)
      ? (inboxRaw as Inbox)
      : 'all'
    const state = params.get('state')
    if (state && !STATES.includes(state)) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }
    const campaignId = params.get('campaign_id')
      ? parseInt(params.get('campaign_id') as string, 10)
      : null
    const workerId = params.get('worker_id')
      ? parseInt(params.get('worker_id') as string, 10)
      : null
    const search = params.get('search')?.trim() ?? ''
    const limit = Math.min(
      Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1),
      200,
    )
    const offset = Math.max(parseInt(params.get('offset') ?? '0', 10) || 0, 0)

    let query = supabase.from('sms_conversations').select(SELECT)

    switch (inbox) {
      case 'mine':
        query = query.eq('assignee_user_id', user.id).neq('state', 'closed')
        break
      case 'needs_response':
        query = query.eq('state', 'needs_response')
        break
      case 'unassigned':
        query = query
          .is('assignee_user_id', null)
          .is('escalated_to_user_id', null)
          .not('state', 'in', '(closed,triage)')
        break
      case 'triage':
        query = query.eq('state', 'triage')
        break
      case 'escalated':
        // Sticky: escalation is independent of state.
        query = query
          .not('escalated_to_user_id', 'is', null)
          .neq('state', 'closed')
        break
      case 'all':
        break
    }

    if (state) query = query.eq('state', state)
    if (campaignId != null && Number.isFinite(campaignId)) {
      query = query.eq('campaign_id', campaignId)
    }
    if (workerId != null && Number.isFinite(workerId)) {
      query = query.eq('worker_id', workerId)
    }

    if (search) {
      const digits = search.replace(/[\s()+-]/g, '')
      if (/^\d{3,}$/.test(digits)) {
        // Phone search: match on the significant tail (04… vs +614…).
        const tail = digits.replace(/^(61|0)/, '')
        query = query.ilike('phone_e164', `%${tail}%`)
      } else {
        // Strip PostgREST .or() filter syntax (commas/parens) from the term.
        const term = `%${search.replace(/[,()]/g, ' ').trim()}%`
        const { data: nameMatches, error: nameErr } = await supabase
          .from('workers')
          .select('worker_id')
          .or(
            `first_name.ilike.${term},last_name.ilike.${term},preferred_name.ilike.${term}`,
          )
          .limit(500)
        if (nameErr) throw nameErr
        const ids = (nameMatches ?? []).map((w) => w.worker_id)
        if (ids.length === 0) return NextResponse.json([])
        query = query.in('worker_id', ids)
      }
    }

    const { data, error } = await query
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('conversation_id', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET sms/conversations error:', error)
    return errorResponse('Failed to fetch conversations', error)
  }
}

interface CreateConversationBody {
  worker_id?: number
  campaign_id?: number | null
  activity_id?: number | null
  sender_number_id?: number | null
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

    const body = (await req.json()) as CreateConversationBody
    const workerId = body.worker_id
    if (workerId == null || !Number.isFinite(workerId)) {
      return NextResponse.json({ error: 'worker_id is required' }, { status: 400 })
    }
    const campaignId =
      body.campaign_id != null && Number.isFinite(body.campaign_id)
        ? body.campaign_id
        : null
    const activityId =
      body.activity_id != null && Number.isFinite(body.activity_id)
        ? body.activity_id
        : null
    if (activityId != null && campaignId == null) {
      return NextResponse.json(
        { error: 'activity_id requires campaign_id' },
        { status: 400 },
      )
    }

    // Campaign-scoped threads require campaign write access; org-wide
    // (NULL campaign) threads only need auth (matches the RLS gate).
    // Note: viewer-role users can therefore create org-wide threads —
    // this mirrors the pre-existing sms_conversations RLS posture
    // (INSERT open to authenticated when campaign_id IS NULL) and is
    // left as-is deliberately.
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

    const { data: worker, error: workerErr } = await supabase
      .from('workers')
      .select('worker_id, phone_e164, sms_opt_out')
      .eq('worker_id', workerId)
      .maybeSingle()
    if (workerErr) throw workerErr
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }
    if (!worker.phone_e164) {
      return NextResponse.json(
        { error: 'This member has no mobile number on file' },
        { status: 400 },
      )
    }
    if (worker.sms_opt_out) {
      return NextResponse.json(
        {
          error:
            'This member has opted out of SMS. They can text START to resubscribe.',
        },
        { status: 403 },
      )
    }

    // Sender: explicit pick, else the requesting user's own organiser
    // number (organisers.email match — same rule as the senders route).
    let senderNumberId: number | null = null
    if (body.sender_number_id != null && Number.isFinite(body.sender_number_id)) {
      const { data: sender, error: senderErr } = await supabase
        .from('sms_numbers')
        .select('number_id, status, purpose')
        .eq('number_id', body.sender_number_id)
        .maybeSingle()
      if (senderErr) throw senderErr
      if (!sender || sender.status !== 'active') {
        return NextResponse.json(
          { error: 'Sender number is not active' },
          { status: 400 },
        )
      }
      // Relay/survey numbers have webhook precedence over conversation
      // routing — every reply would be consumed before it reached the
      // thread, orphaning it permanently. Chats must use an organiser
      // (or spare) number.
      if (sender.purpose === 'relay' || sender.purpose === 'survey') {
        return NextResponse.json(
          {
            error:
              'Relay and survey numbers cannot start chats — replies on those numbers never reach the inbox. Pick an organiser number.',
          },
          { status: 400 },
        )
      }
      senderNumberId = sender.number_id
    } else {
      const userEmail = (user.email ?? '').toLowerCase()
      if (userEmail) {
        const { data: organisers, error: orgErr } = await supabase
          .from('organisers')
          .select('organiser_id, email')
          .ilike('email', userEmail)
        if (orgErr) throw orgErr
        const organiserIds = (organisers ?? []).map((o) => o.organiser_id)
        if (organiserIds.length > 0) {
          const { data: ownNumbers, error: numErr } = await supabase
            .from('sms_numbers')
            .select('number_id')
            .eq('status', 'active')
            .not('purpose', 'in', '(relay,survey)')
            .in('organiser_id', organiserIds)
            .order('number_id', { ascending: true })
            .limit(1)
          if (numErr) throw numErr
          senderNumberId = ownNumbers?.[0]?.number_id ?? null
        }
      }
      if (senderNumberId == null) {
        return NextResponse.json(
          {
            error:
              'No sender number is assigned to you — pick a sender number for this chat.',
          },
          { status: 400 },
        )
      }
    }

    // Create-or-attach on the exact thread key (NULLS NOT DISTINCT):
    // insert, and on 23505 re-select using .is() for the NULL-campaign
    // scope (the webhook's create-race pattern).
    const insertRow = {
      our_number_id: senderNumberId,
      phone_e164: worker.phone_e164,
      worker_id: worker.worker_id,
      campaign_id: campaignId,
      activity_id: activityId,
      state: 'needs_message',
    }
    const { data: created, error: convErr } = await supabase
      .from('sms_conversations')
      .insert(insertRow)
      .select('conversation_id')
      .single()

    if (!convErr) {
      return NextResponse.json(
        { conversation_id: created.conversation_id, existing: false },
        { status: 201 },
      )
    }
    if (convErr.code !== UNIQUE_VIOLATION) throw convErr

    let q = supabase
      .from('sms_conversations')
      .select('conversation_id')
      .eq('our_number_id', senderNumberId)
      .eq('phone_e164', worker.phone_e164)
    q =
      campaignId == null ? q.is('campaign_id', null) : q.eq('campaign_id', campaignId)
    const { data: existing, error: existErr } = await q.maybeSingle()
    if (existErr) throw existErr
    if (!existing) {
      // Key occupied but not visible — shouldn't happen (reads are
      // USING(true)); surface as a conflict rather than a silent retry.
      return NextResponse.json(
        { error: 'Thread exists but could not be loaded' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { conversation_id: existing.conversation_id, existing: true },
      { status: 200 },
    )
  } catch (error) {
    console.error('POST sms/conversations error:', error)
    return errorResponse('Failed to start conversation', error)
  }
}
