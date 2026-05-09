import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/calls/lists/[listId]/link-script
 *
 * Body: { script_id, set_current?: boolean, wave_label?, notes? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params
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

    // Verify the list exists and get its campaign_id.
    const { data: list } = await supabase
      .from('call_lists')
      .select('list_id, campaign_id')
      .eq('list_id', parseInt(listId))
      .single()
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

    // Verify the script belongs to the same campaign (or the standing campaign).
    const { data: script } = await supabase
      .from('call_scripts')
      .select('script_id, campaign_id')
      .eq('script_id', scriptId)
      .single()
    if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    if (script.campaign_id != null && script.campaign_id !== list.campaign_id) {
      return NextResponse.json({ error: 'Script belongs to a different campaign' }, { status: 400 })
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
    console.error('POST /api/calls/lists/[listId]/link-script error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to link script' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/calls/lists/[listId]/link-script?script_id=X
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const scriptId = parseInt(url.searchParams.get('script_id') ?? '', 10)
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
    console.error('DELETE /api/calls/lists/[listId]/link-script error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unlink script' },
      { status: 500 }
    )
  }
}
