/**
 * GET /api/email/conversations — inbox listing for the hybrid email
 * inbox. Filters: ?state= (needs_response|convo|messaged|closed|triage|
 * open) and ?q= (address/subject substring). RLS: authenticated read.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = req.nextUrl.searchParams.get('state')
  const q = req.nextUrl.searchParams.get('q')?.trim()

  let query = supabase
    .from('email_conversations')
    .select(
      `conversation_id, worker_id, email_address, campaign_id, subject, state,
       unread_count, last_message_at, last_inbound_at, last_outbound_at, created_at,
       workers(worker_id, first_name, last_name, email_opt_out),
       campaigns(campaign_id, name)`,
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  if (state && state !== 'all') {
    if (state === 'open') {
      query = query.neq('state', 'closed')
    } else {
      query = query.eq('state', state)
    }
  }
  if (q) {
    query = query.or(`email_address.ilike.%${q}%,subject.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conversations: data ?? [] })
}
