import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const campaignRaw = req.nextUrl.searchParams.get('campaign_id')
    const campaignId = campaignRaw ? parseInt(campaignRaw, 10) : null
    let query = supabase
      .from('email_canned_replies')
      .select('*')
      .eq('is_active', true)
      .order('campaign_id', { ascending: true, nullsFirst: true })
      .order('title', { ascending: true })
    query =
      campaignId != null && Number.isFinite(campaignId)
        ? query.or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
        : query.is('campaign_id', null)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('GET email canned replies error:', error)
    return errorResponse('Failed to load saved replies', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = (await req.json().catch(() => null)) as {
      title?: string
      body?: string
      campaign_id?: number | null
    } | null
    const title = payload?.title?.trim() ?? ''
    const body = payload?.body?.trim() ?? ''
    if (!title || !body) {
      return NextResponse.json({ error: 'Title and body are required' }, { status: 400 })
    }
    if (title.length > 120 || body.length > 10_000) {
      return NextResponse.json(
        { error: 'Saved reply is too long' },
        { status: 400 },
      )
    }
    if (
      payload?.campaign_id !== undefined &&
      payload.campaign_id !== null &&
      (!Number.isFinite(payload.campaign_id) || payload.campaign_id <= 0)
    ) {
      return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
    }

    const { data: reply, error } = await supabase
      .from('email_canned_replies')
      .insert({
        title,
        body,
        campaign_id: payload?.campaign_id ?? null,
        created_by: user.id,
      })
      .select('*')
      .single()
    if (error) throw error

    return NextResponse.json({ ok: true, reply }, { status: 201 })
  } catch (error) {
    console.error('POST email canned reply error:', error)
    return errorResponse('Failed to save reply', error)
  }
}
