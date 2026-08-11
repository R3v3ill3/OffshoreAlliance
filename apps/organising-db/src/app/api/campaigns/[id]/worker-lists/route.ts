import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const status = url.searchParams.get('status') // optional filter (draft / fired / archived)

    let q = supabase
      .from('campaign_worker_lists')
      .select(
        `list_id, campaign_id, name, description, default_purpose, status,
         leader_worker_id, leader_organiser_id, source,
         fired_call_list_id, fired_draft_id, fired_task_list_id,
         fired_sms_list_id, fired_email_list_id, fired_at,
         created_by, created_at, updated_at,
         items_count:campaign_worker_list_items(count)`
      )
      .eq('campaign_id', cid)
      .order('updated_at', { ascending: false })

    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET worker-lists error:', error)
    return NextResponse.json({ error: 'Failed to fetch worker lists' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, description, default_purpose } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (default_purpose != null && !['email', 'phone', 'task', 'sms'].includes(default_purpose)) {
      return NextResponse.json({ error: 'Invalid default_purpose' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campaign_worker_lists')
      .insert({
        campaign_id: cid,
        name: name.trim(),
        description: description?.trim() || null,
        default_purpose: default_purpose ?? null,
        status: 'draft',
        source: 'wall_chart',
        created_by: user.id,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('POST worker-lists error:', error)
    return NextResponse.json({ error: 'Failed to create worker list' }, { status: 500 })
  }
}
