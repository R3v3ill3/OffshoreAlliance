import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
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
      .order('sort_order', { ascending: true })

    if (error) throw error

    const enriched = data?.map((item) => {
      const w = item.workers as Record<string, unknown> | null
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
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('GET call-list-items error:', error)
    return NextResponse.json({ error: 'Failed to fetch list items' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { item_id, ...updates } = body

    if (!item_id) {
      return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
    }

    const allowedFields = ['status', 'sort_order', 'priority_score', 'assigned_to', 'next_call_at', 'notes']
    const filtered: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (updates[key] !== undefined) filtered[key] = updates[key]
    }

    const { data, error } = await supabase
      .from('call_list_items')
      .update(filtered)
      .eq('item_id', item_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH call-list-item error:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}
