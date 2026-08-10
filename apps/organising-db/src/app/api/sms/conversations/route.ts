/**
 * SMS inbox queue list.
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
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

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
