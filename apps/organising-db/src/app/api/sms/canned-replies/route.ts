/**
 * Canned replies for the SMS inbox (minimal management — brief §7.3).
 *
 * GET  ?campaign_id= — active org-wide rows plus the campaign's own.
 * POST — create (campaign_id NULL = org-wide). RLS gates campaign-
 *        scoped writes via can_write_to_campaign.
 */
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
      .from('sms_canned_replies')
      .select('reply_id, campaign_id, title, body, is_active, created_by, created_at, updated_at')
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
    console.error('GET sms/canned-replies error:', error)
    return errorResponse('Failed to fetch canned replies', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = (await req.json()) as {
      title?: string
      body?: string
      campaign_id?: number | null
    }
    const title = payload.title?.trim()
    const body = payload.body?.trim()
    if (!title || !body) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 },
      )
    }

    const { data: reply, error } = await supabase
      .from('sms_canned_replies')
      .insert({
        title,
        body,
        campaign_id: payload.campaign_id ?? null,
        created_by: user.id,
      })
      .select('*')
      .single()
    if (error) throw error

    return NextResponse.json({ ok: true, reply }, { status: 201 })
  } catch (error) {
    console.error('POST sms/canned-replies error:', error)
    return errorResponse('Failed to create canned reply', error)
  }
}
