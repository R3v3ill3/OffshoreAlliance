import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  try {
    const { scriptId } = await params
    const sid = parseInt(scriptId, 10)
    if (!Number.isFinite(sid)) {
      return NextResponse.json({ error: 'Invalid scriptId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: row, error: fetchErr } = await supabase
      .from('call_scripts')
      .select('script_id, campaign_id')
      .eq('script_id', sid)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!row) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

    const { error: delOutcomesErr } = await supabase
      .from('call_outcome_definitions')
      .delete()
      .eq('script_id', sid)
    if (delOutcomesErr) throw delOutcomesErr

    const { error: delScriptErr } = await supabase
      .from('call_scripts')
      .delete()
      .eq('script_id', sid)
    if (delScriptErr) throw delScriptErr

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/calls/scripts/[scriptId] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete script' },
      { status: 500 }
    )
  }
}
