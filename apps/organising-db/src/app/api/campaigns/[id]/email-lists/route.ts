/**
 * Email recipient lists for a campaign.
 *
 * Mirrors /api/campaigns/[id]/call-lists/route.ts. List rows live in
 * email_lists; members in email_list_items (populated via the sibling
 * .../[listId]/populate endpoint).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('email_lists')
      .select('*')
      .eq('campaign_id', cid)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET email-lists error:', error)
    return NextResponse.json({ error: 'Failed to fetch email lists' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params
    const cid = parseInt(campaignId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, description, draft_id, source_filters } = body as {
      name?: string
      description?: string
      draft_id?: number
      source_filters?: Record<string, unknown>
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_lists')
      .insert({
        campaign_id: cid,
        draft_id: draft_id ?? null,
        name,
        description: description || null,
        source_filters: source_filters || null,
        status: 'draft',
        created_by: user.id,
      })
      .select('*')
      .single()
    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('POST email-lists error:', error)
    return NextResponse.json({ error: 'Failed to create email list' }, { status: 500 })
  }
}
