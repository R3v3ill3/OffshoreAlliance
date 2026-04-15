import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: list } = await supabase
      .from('call_lists')
      .select('priority_strategy')
      .eq('list_id', parseInt(listId))
      .single()

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    const { data: callbacksDue } = await supabase
      .from('call_list_items')
      .select(`
        *,
        workers (
          worker_id, first_name, last_name, email, phone,
          occupation,
          employers (employer_name),
          worksites (worksite_name)
        )
      `)
      .eq('list_id', parseInt(listId))
      .eq('status', 'deferred')
      .lte('next_call_at', new Date().toISOString())
      .order('next_call_at', { ascending: true })
      .limit(1)

    if (callbacksDue && callbacksDue.length > 0) {
      return NextResponse.json(enrichItem(callbacksDue[0], campaignId, supabase))
    }

    let query = supabase
      .from('call_list_items')
      .select(`
        *,
        workers (
          worker_id, first_name, last_name, email, phone,
          occupation,
          employers (employer_name),
          worksites (worksite_name)
        )
      `)
      .eq('list_id', parseInt(listId))
      .eq('status', 'pending')
      .limit(1)

    switch (list.priority_strategy) {
      case 'priority_score':
        query = query.order('priority_score', { ascending: false })
        break
      case 'least_recently_contacted':
        query = query.order('last_attempt_at', { ascending: true, nullsFirst: true })
        break
      case 'random':
        query = query.order('sort_order', { ascending: true })
        break
      default:
        query = query.order('sort_order', { ascending: true })
    }

    const { data: items } = await query

    if (!items || items.length === 0) {
      return NextResponse.json({ done: true, message: 'No more contacts to call' })
    }

    return NextResponse.json(await enrichItem(items[0], campaignId, supabase))
  } catch (error) {
    console.error('Phone Next error:', error)
    return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
  }
}

async function enrichItem(
  item: Record<string, unknown>,
  campaignId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const w = item.workers as Record<string, unknown> | null
  const workerId = w?.worker_id as number

  let connection = null
  if (workerId) {
      const { data } = await supabase
        .from('worker_campaign_connections')
        .select('connection_id, connection_status, support_level, contact_count, last_contacted_at, notes')
        .eq('worker_id', workerId)
        .eq('campaign_id', parseInt(campaignId))
        .maybeSingle()

    connection = data
  }

  let recentAttempts: unknown[] = []
  if (item.item_id) {
    const { data } = await supabase
      .from('call_attempts')
      .select('*')
      .eq('list_item_id', item.item_id as number)
      .order('started_at', { ascending: false })
      .limit(5)

    recentAttempts = data || []
  }

  return {
    ...item,
    worker: w ? {
      worker_id: w.worker_id,
      first_name: w.first_name,
      last_name: w.last_name,
      email: w.email,
      phone: w.phone,
      occupation: w.occupation,
      employer_name: (w.employers as Record<string, unknown> | null)?.employer_name || null,
      worksite_name: (w.worksites as Record<string, unknown> | null)?.worksite_name || null,
    } : null,
    workers: undefined,
    connection,
    recent_attempts: recentAttempts,
  }
}
