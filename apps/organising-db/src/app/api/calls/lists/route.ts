import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/calls/lists?campaign_id=X[&script_id=Y] */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const campaignIdParam = url.searchParams.get('campaign_id')
    const scriptIdParam = url.searchParams.get('script_id')

    if (!campaignIdParam) {
      return NextResponse.json({ error: 'campaign_id query param is required' }, { status: 400 })
    }

    const campaignId = parseInt(campaignIdParam, 10)
    const scriptId = scriptIdParam ? parseInt(scriptIdParam, 10) : null

    const { data, error } = await supabase
      .from('call_lists')
      .select('*, call_scripts!script_id(script_id, title, status), call_list_scripts(script_id, is_current, wave_label, linked_at)')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const enriched = (data ?? []).map((list) => {
      const links = (list.call_list_scripts ?? []) as Array<{ script_id: number; is_current: boolean; wave_label: string | null; linked_at: string }>
      const linkedScriptIds = links.map((l) => l.script_id)
      const currentLink = links.find((l) => l.is_current) ?? null
      return {
        ...list,
        linked_script_ids: linkedScriptIds,
        linked_script_count: linkedScriptIds.length,
        current_script_id: currentLink?.script_id ?? list.script_id ?? null,
        previously_linked: scriptId != null ? linkedScriptIds.includes(scriptId) : false,
        is_current_for_script: scriptId != null && currentLink?.script_id === scriptId,
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('GET /api/calls/lists error:', error)
    return NextResponse.json({ error: 'Failed to fetch call lists' }, { status: 500 })
  }
}

/** POST /api/calls/lists — body must include campaign_id */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { campaign_id, name, description, script_id, priority_strategy, source_filters, wave_label } = body

    if (!campaign_id) return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('call_lists')
      .insert({
        campaign_id: parseInt(String(campaign_id), 10),
        name,
        description: description || null,
        script_id: script_id || null,
        priority_strategy: priority_strategy || 'sequential',
        source_filters: source_filters || null,
        status: 'draft',
        created_by: user.id,
      })
      .select('*, call_scripts!script_id(script_id, title, status)')
      .single()

    if (error) throw error

    if (script_id) {
      const { error: linkErr } = await supabase
        .from('call_list_scripts')
        .insert({
          list_id: data.list_id,
          script_id,
          wave_label: wave_label || 'Initial',
          is_current: true,
          linked_by: user.id,
        })
      if (linkErr) {
        console.error('Failed to insert call_list_scripts row for new list:', linkErr)
      }
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('POST /api/calls/lists error:', error)
    return NextResponse.json({ error: 'Failed to create call list' }, { status: 500 })
  }
}
