import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; scriptId: string }> }
) {
  try {
    const { id: campaignId, scriptId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cid = parseInt(campaignId, 10)
    const sid = parseInt(scriptId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const { data: row, error: fetchErr } = await supabase
      .from('call_scripts')
      .select('script_id, campaign_id')
      .eq('script_id', sid)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!row || row.campaign_id !== cid) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }

    const { error: delOutcomesErr } = await supabase
      .from('call_outcome_definitions')
      .delete()
      .eq('script_id', sid)

    if (delOutcomesErr) throw delOutcomesErr

    const { error: delScriptErr } = await supabase
      .from('call_scripts')
      .delete()
      .eq('script_id', sid)
      .eq('campaign_id', cid)

    if (delScriptErr) throw delScriptErr

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE call-script error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete script' },
      { status: 500 }
    )
  }
}
