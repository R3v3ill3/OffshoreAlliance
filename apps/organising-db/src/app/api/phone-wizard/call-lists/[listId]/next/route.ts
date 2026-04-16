import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params
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

    const workerSelect = `
      *,
      workers (
        worker_id, first_name, last_name, email, phone,
        occupation, address, suburb, state, postcode,
        employer_id, worksite_id,
        union_membership_type_id,
        union_membership_type:union_membership_types(type_name),
        employers (employer_id, employer_name),
        worksites (worksite_id, worksite_name)
      )
    `

    // Check for overdue callbacks first
    const { data: callbacksDue } = await supabase
      .from('call_list_items')
      .select(workerSelect)
      .eq('list_id', parseInt(listId))
      .eq('status', 'deferred')
      .lte('next_call_at', new Date().toISOString())
      .order('next_call_at', { ascending: true })
      .limit(1)

    if (callbacksDue && callbacksDue.length > 0) {
      return NextResponse.json(enrichItem(callbacksDue[0]))
    }

    let query = supabase
      .from('call_list_items')
      .select(workerSelect)
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
      default:
        query = query.order('sort_order', { ascending: true })
    }

    const { data: items } = await query

    if (!items || items.length === 0) {
      return NextResponse.json({ done: true, message: 'No more contacts to call' })
    }

    // Fetch recent attempts for this item
    const item = items[0]
    let recentAttempts: unknown[] = []
    if (item.item_id) {
      const { data: attempts } = await supabase
        .from('call_attempts')
        .select('*')
        .eq('list_item_id', item.item_id as number)
        .order('started_at', { ascending: false })
        .limit(5)
      recentAttempts = attempts || []
    }

    return NextResponse.json({ ...enrichItem(item), recent_attempts: recentAttempts })
  } catch (error) {
    console.error('Phone wizard next error:', error)
    return NextResponse.json({ error: 'Failed to get next contact' }, { status: 500 })
  }
}

function enrichItem(item: Record<string, unknown>) {
  const w = item.workers as Record<string, unknown> | null
  const employers = w?.employers as Record<string, unknown> | null
  const worksites = w?.worksites as Record<string, unknown> | null
  const umt = w?.union_membership_type as { type_name: string } | { type_name: string }[] | null | undefined
  const unionType = Array.isArray(umt) ? umt[0] : umt

  return {
    ...item,
    worker: w ? {
      worker_id: w.worker_id,
      first_name: w.first_name,
      last_name: w.last_name,
      email: w.email,
      phone: w.phone,
      occupation: w.occupation,
      address: w.address || null,
      suburb: w.suburb || null,
      state: w.state || null,
      postcode: w.postcode || null,
      employer_id: w.employer_id || null,
      worksite_id: w.worksite_id || null,
      union_membership_type_id: (w.union_membership_type_id as number | null) ?? null,
      union_membership_type_name: unionType?.type_name ?? null,
      employer_name: employers?.employer_name || null,
      worksite_name: worksites?.worksite_name || null,
    } : null,
    workers: undefined,
    connection: null,
  }
}
