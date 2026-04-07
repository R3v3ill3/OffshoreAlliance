import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ campaignId: string }> }

// GET /api/campaigns/[id]/organisers
// Returns the full team roster for a campaign
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { campaignId: id } = await params
    const campaignId = parseInt(id, 10)
    if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('campaign_organisers')
      .select(`
        id,
        campaign_id,
        campaign_role,
        added_at,
        organiser:organisers!campaign_organisers_organiser_id_fkey(
          organiser_id, organiser_name, email,
          user_profiles(user_id, display_name, work_role, reports_to)
        ),
        reports_to_organiser:organisers!campaign_organisers_reports_to_organiser_id_fkey(
          organiser_id, organiser_name, email
        )
      `)
      .eq('campaign_id', campaignId)
      .order('campaign_role')
      .order('added_at')

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[campaign-organisers GET]', err)
    return NextResponse.json({ error: 'Failed to load campaign team' }, { status: 500 })
  }
}

// POST /api/campaigns/[id]/organisers
// Body: { organiser_id: number, campaign_role: string, reports_to_organiser_id?: number | null }
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { campaignId: id } = await params
    const campaignId = parseInt(id, 10)
    if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { organiser_id, campaign_role = 'organiser', reports_to_organiser_id = null } = body

    if (!organiser_id) return NextResponse.json({ error: 'organiser_id is required' }, { status: 400 })

    const validRoles = ['lead', 'organiser', 'coordinator', 'industrial_officer', 'specialist']
    if (!validRoles.includes(campaign_role)) {
      return NextResponse.json({ error: `campaign_role must be one of: ${validRoles.join(', ')}` }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campaign_organisers')
      .insert({
        campaign_id: campaignId,
        organiser_id,
        campaign_role,
        reports_to_organiser_id: reports_to_organiser_id ?? null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This organiser is already on the campaign team' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[campaign-organisers POST]', err)
    return NextResponse.json({ error: 'Failed to add organiser to team' }, { status: 500 })
  }
}

// PATCH /api/campaigns/[id]/organisers
// Body: { id: number, campaign_role?: string, reports_to_organiser_id?: number | null }
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { campaignId: id } = await params
    const campaignId = parseInt(id, 10)
    if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id: rowId, campaign_role, reports_to_organiser_id } = body

    if (!rowId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (campaign_role !== undefined) {
      const validRoles = ['lead', 'organiser', 'coordinator', 'industrial_officer', 'specialist']
      if (!validRoles.includes(campaign_role)) {
        return NextResponse.json({ error: `campaign_role must be one of: ${validRoles.join(', ')}` }, { status: 400 })
      }
      updates.campaign_role = campaign_role
    }
    if (reports_to_organiser_id !== undefined) {
      updates.reports_to_organiser_id = reports_to_organiser_id ?? null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campaign_organisers')
      .update(updates)
      .eq('id', rowId)
      .eq('campaign_id', campaignId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('[campaign-organisers PATCH]', err)
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
  }
}

// DELETE /api/campaigns/[id]/organisers?rowId=<id>
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { campaignId: id } = await params
    const campaignId = parseInt(id, 10)
    if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const rowId = searchParams.get('rowId')
    if (!rowId) return NextResponse.json({ error: 'rowId query param is required' }, { status: 400 })

    const { error } = await supabase
      .from('campaign_organisers')
      .delete()
      .eq('id', parseInt(rowId, 10))
      .eq('campaign_id', campaignId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[campaign-organisers DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 })
  }
}
