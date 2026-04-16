import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    if (!body.list_item_id || !body.dial_disposition) {
      return NextResponse.json(
        { error: 'list_item_id and dial_disposition are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('record_call_attempt', {
      p_list_item_id: body.list_item_id,
      p_script_id: body.script_id || null,
      p_caller_user_id: user.id,
      p_dial_disposition: body.dial_disposition,
      p_call_disposition: body.call_disposition || null,
      p_overall_notes: body.overall_notes || null,
      p_callback_datetime: body.callback_datetime || null,
      p_support_level: body.support_level_assessed || null,
      p_follow_up_action: body.follow_up_action || null,
      p_cta_response: body.cta_response || null,
      p_duration_seconds: body.duration_seconds || null,
      p_step_outcomes: body.step_outcomes || [],
      p_outcome_ids: body.outcome_ids || [],
    })

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Phone wizard record call attempt error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record call attempt' },
      { status: 500 }
    )
  }
}
