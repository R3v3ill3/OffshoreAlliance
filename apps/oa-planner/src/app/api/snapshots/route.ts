import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { campaign_id, snapshot_type = 'manual' } = body

    // Get all active campaigns or specific campaign
    let campaignQuery = supabase
      .from('campaigns')
      .select(`
        campaign_id,
        name,
        status,
        campaign_stage_plans(stage_number, stage_name, status),
        gate_definitions(gate_number, gate_name, gate_criteria(is_met, criterion_name))
      `)

    if (campaign_id) {
      campaignQuery = campaignQuery.eq('campaign_id', campaign_id)
    } else {
      campaignQuery = campaignQuery.eq('status', 'active')
    }

    const { data: campaigns, error } = await campaignQuery

    if (error) throw error

    const snapshots = campaigns?.map((campaign) => ({
      campaign_id: campaign.campaign_id,
      snapshot_date: new Date().toISOString().split('T')[0],
      snapshot_type,
      data: {
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        stages: campaign.campaign_stage_plans,
        gates: campaign.gate_definitions,
        captured_at: new Date().toISOString(),
      },
      created_by: user.id,
    }))

    if (snapshots && snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('reporting_snapshots')
        .insert(snapshots)

      if (insertError) throw insertError
    }

    return NextResponse.json({
      success: true,
      snapshots_created: snapshots?.length || 0,
    })
  } catch (error) {
    console.error('Snapshot error:', error)
    return NextResponse.json({ error: 'Failed to create snapshots' }, { status: 500 })
  }
}

// For Vercel Cron — called weekly
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')

  // Verify cron secret
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Use service role for cron job
    const supabase = await createClient()

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select(`
        campaign_id,
        name,
        status,
        campaign_stage_plans(stage_number, stage_name, status),
        gate_definitions(gate_number, gate_name, gate_criteria(is_met, criterion_name))
      `)
      .eq('status', 'active')

    if (error) throw error

    const snapshots = campaigns?.map((campaign) => ({
      campaign_id: campaign.campaign_id,
      snapshot_date: new Date().toISOString().split('T')[0],
      snapshot_type: 'weekly',
      data: {
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        stages: campaign.campaign_stage_plans,
        gates: campaign.gate_definitions,
        captured_at: new Date().toISOString(),
      },
    }))

    if (snapshots && snapshots.length > 0) {
      await supabase.from('reporting_snapshots').insert(snapshots)
    }

    return NextResponse.json({ success: true, count: snapshots?.length || 0 })
  } catch (_error) {
    return NextResponse.json({ error: 'Snapshot failed' }, { status: 500 })
  }
}
