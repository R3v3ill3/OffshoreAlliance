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
      .from('call_lists')
      .select(
        `*,
         call_scripts!script_id(*, call_script_sections(*)),
         call_list_scripts(
           script_id,
           is_current,
           wave_label,
           linked_at,
           notes,
           call_scripts(script_id, title, status, call_objective, call_script_sections(*))
         )`
      )
      .eq('list_id', parseInt(listId))
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET call-list error:', error)
    return NextResponse.json({ error: 'Failed to fetch call list' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const allowedFields = ['name', 'description', 'status', 'script_id', 'priority_strategy']
    const updates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('call_lists')
      .update(updates)
      .eq('list_id', parseInt(listId))
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH call-list error:', error)
    return NextResponse.json({ error: 'Failed to update call list' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from('call_lists')
      .select('list_id, campaign_id')
      .eq('list_id', lid)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!row || row.campaign_id == null || row.campaign_id !== cid) {
      return NextResponse.json({ error: 'Call list not found' }, { status: 404 })
    }

    const { error: delErr } = await supabase
      .from('call_lists')
      .delete()
      .eq('list_id', lid)
      .eq('campaign_id', cid)

    if (delErr) throw delErr

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE call-list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete call list' },
      { status: 500 }
    )
  }
}
