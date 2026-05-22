/**
 * Single email-list operations: read, patch, delete.
 * Mirrors /api/campaigns/[id]/call-lists/[listId]/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { listId } = await params
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid list id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('email_lists')
      .select('*, email_list_items(item_id, worker_id, email, sort_order, status, sent_at)')
      .eq('list_id', lid)
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET email-list error:', error)
    return NextResponse.json({ error: 'Failed to fetch email list' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { listId } = await params
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid list id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const allowedFields = ['name', 'description', 'status', 'draft_id', 'source_filters']
    const updates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('email_lists')
      .update(updates)
      .eq('list_id', lid)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH email-list error:', error)
    return NextResponse.json({ error: 'Failed to update email list' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: row, error: fetchErr } = await supabase
      .from('email_lists')
      .select('list_id, campaign_id')
      .eq('list_id', lid)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!row || row.campaign_id !== cid) {
      return NextResponse.json({ error: 'Email list not found' }, { status: 404 })
    }

    const { error: delErr } = await supabase
      .from('email_lists')
      .delete()
      .eq('list_id', lid)
      .eq('campaign_id', cid)
    if (delErr) throw delErr

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE email-list error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to delete email list',
      },
      { status: 500 },
    )
  }
}
