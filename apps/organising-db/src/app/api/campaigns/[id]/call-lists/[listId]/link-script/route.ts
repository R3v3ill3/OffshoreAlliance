import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/campaigns/[id]/call-lists/[listId]/link-script
 *
 * Body: { script_id, set_current?: boolean, wave_label?, notes? }
 *
 * Creates (or updates) a row in call_list_scripts connecting the given list
 * to the given script. If set_current is true (default), marks this link as
 * the current wave; the DB trigger demotes any other current row and keeps
 * call_lists.script_id pointed at this script.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const scriptId = Number(body.script_id)
    const setCurrent = body.set_current !== false
    const waveLabel: string | null = body.wave_label ?? null
    const notes: string | null = body.notes ?? null

    if (!Number.isFinite(scriptId)) {
      return NextResponse.json({ error: 'script_id is required' }, { status: 400 })
    }

    // Sanity check: script belongs to the same campaign (or is standalone).
    const { data: script, error: scriptErr } = await supabase
      .from('call_scripts')
      .select('script_id, campaign_id')
      .eq('script_id', scriptId)
      .single()
    if (scriptErr || !script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }
    if (script.campaign_id != null && String(script.campaign_id) !== String(campaignId)) {
      return NextResponse.json({ error: 'Script belongs to a different campaign' }, { status: 400 })
    }

    // Sanity check: list belongs to the given campaign.
    const { data: list, error: listErr } = await supabase
      .from('call_lists')
      .select('list_id, campaign_id')
      .eq('list_id', parseInt(listId))
      .single()
    if (listErr || !list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }
    if (list.campaign_id != null && String(list.campaign_id) !== String(campaignId)) {
      return NextResponse.json({ error: 'List belongs to a different campaign' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('call_list_scripts')
      .upsert(
        {
          list_id: parseInt(listId),
          script_id: scriptId,
          wave_label: waveLabel,
          notes,
          is_current: setCurrent,
          linked_by: user.id,
          linked_at: new Date().toISOString(),
        },
        { onConflict: 'list_id,script_id' }
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, link: data }, { status: 200 })
  } catch (error) {
    console.error('POST link-script error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to link script' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/campaigns/[id]/call-lists/[listId]/link-script?script_id=X
 *
 * Removes a script <-> list linkage.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const scriptIdParam = url.searchParams.get('script_id')
    const scriptId = scriptIdParam ? parseInt(scriptIdParam, 10) : NaN
    if (!Number.isFinite(scriptId)) {
      return NextResponse.json({ error: 'script_id query param is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('call_list_scripts')
      .delete()
      .eq('list_id', parseInt(listId))
      .eq('script_id', scriptId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE link-script error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unlink script' },
      { status: 500 }
    )
  }
}
