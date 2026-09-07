/**
 * Campaign-aware email work queue.
 *
 * GET ?inbox=mine|needs_response|unassigned|triage|waiting|closed|all
 *     &campaign_id=&worker_id=&search=&unread=true&limit=
 *     &cursor_at=<ISO|__null__>&cursor_id=
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

const INBOXES = [
  'mine',
  'needs_response',
  'unassigned',
  'triage',
  'waiting',
  'team',
  'closed',
  'all',
] as const

type Inbox = (typeof INBOXES)[number]

const SELECT = `
  conversation_id, worker_id, email_address, campaign_id, subject,
  original_subject, last_message_preview, state, assignee_user_id,
  claim_user_id, claimed_until, unread_count, last_message_at, last_inbound_at, last_outbound_at,
  graph_conversation_id, closed_at, created_at, updated_at,
  worker:workers(
    worker_id, first_name, last_name, preferred_name, email, occupation,
    email_status, email_opt_out, email_opt_out_at, email_opt_out_source,
    employer:employers(employer_id, employer_name),
    worksite:worksites(worksite_id, worksite_name)
  ),
  campaign:campaigns(campaign_id, name, campaign_type, status)
`

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = req.nextUrl.searchParams
    const legacyState = params.get('state')
    const inboxRaw = params.get('inbox') ?? (legacyState === 'closed' ? 'closed' : 'all')
    const inbox: Inbox = (INBOXES as readonly string[]).includes(inboxRaw)
      ? (inboxRaw as Inbox)
      : 'all'
    const campaignId = params.get('campaign_id')
      ? parseInt(params.get('campaign_id') as string, 10)
      : null
    const workerId = params.get('worker_id')
      ? parseInt(params.get('worker_id') as string, 10)
      : null
    const search = (params.get('search') ?? params.get('q') ?? '').trim()
    const unreadOnly = params.get('unread') === 'true'
    const limit = Math.min(
      Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1),
      200,
    )
    const cursorAtRaw = params.get('cursor_at')
    const cursorId = params.get('cursor_id')
      ? parseInt(params.get('cursor_id') as string, 10)
      : null

    let query = supabase.from('email_conversations').select(SELECT)

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
          .not('state', 'in', '(closed,triage)')
        break
      case 'triage':
        query = query.eq('state', 'triage')
        break
      case 'waiting':
        query = query.in('state', ['convo', 'messaged'])
        break
      case 'team':
        query = query.neq('state', 'closed')
        break
      case 'closed':
        query = query.eq('state', 'closed')
        break
      case 'all':
        break
    }

    if (legacyState && legacyState !== 'all' && legacyState !== 'open') {
      query = query.eq('state', legacyState)
    } else if (legacyState === 'open') {
      query = query.neq('state', 'closed')
    }
    if (campaignId != null && Number.isFinite(campaignId)) {
      query = query.eq('campaign_id', campaignId)
    }
    if (workerId != null && Number.isFinite(workerId)) {
      query = query.eq('worker_id', workerId)
    }
    if (unreadOnly) query = query.gt('unread_count', 0)
    if (cursorAtRaw && cursorId != null && Number.isFinite(cursorId)) {
      if (cursorAtRaw === '__null__') {
        query = query.is('last_message_at', null).lt('conversation_id', cursorId)
      } else {
        const cursorAt = new Date(cursorAtRaw)
        if (!Number.isNaN(cursorAt.getTime())) {
          const iso = cursorAt.toISOString()
          query = query.or(
            `last_message_at.lt.${iso},and(last_message_at.eq.${iso},conversation_id.lt.${cursorId}),last_message_at.is.null`,
          )
        }
      }
    }

    if (search) {
      const safe = search.replace(/[,()]/g, ' ').trim().slice(0, 120)
      const term = `%${safe}%`
      const { data: workerMatches, error: workerError } = await supabase
        .from('workers')
        .select('worker_id')
        .or(
          `first_name.ilike.${term},last_name.ilike.${term},preferred_name.ilike.${term},email.ilike.${term}`,
        )
        .limit(500)
      if (workerError) throw workerError
      const workerIds = (workerMatches ?? []).map((worker) => worker.worker_id)
      const filters = [
        `email_address.ilike.${term}`,
        `subject.ilike.${term}`,
        `subject_normalized.ilike.${term}`,
        `last_message_preview.ilike.${term}`,
      ]
      if (workerIds.length > 0) {
        filters.push(`worker_id.in.(${workerIds.join(',')})`)
      }
      query = query.or(filters.join(','))
    }

    const { data, error } = await query
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('conversation_id', { ascending: false })
      .limit(limit)
    if (error) throw error
    const overdueCutoff = Date.now() - 24 * 60 * 60 * 1000
    return NextResponse.json(
      (data ?? []).map((conversation) => ({
        ...conversation,
        is_overdue:
          conversation.state === 'needs_response' &&
          conversation.last_inbound_at != null &&
          Date.parse(conversation.last_inbound_at) < overdueCutoff,
      })),
    )
  } catch (error) {
    console.error('GET email/conversations error:', error)
    return errorResponse('Failed to load email conversations', error)
  }
}
