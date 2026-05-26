import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /api/calls/attempts — record a call attempt via the record_call_attempt RPC */
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

    // JSONB params must be sent as real JS arrays — NOT JSON-stringified.
    // Supabase JS forwards each value to PostgREST as a JSON value;
    // PostgREST passes it to Postgres as JSONB. A JS array becomes a
    // JSONB array (what jsonb_array_elements expects). A JSON-stringified
    // array becomes a JSONB scalar string, which trips
    // "cannot extract elements from a scalar" inside the RPC.
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
      p_step_outcomes: Array.isArray(body.step_outcomes) ? body.step_outcomes : [],
      p_objections: Array.isArray(body.objections) ? body.objections : [],
      p_issues: Array.isArray(body.issues) ? body.issues : [],
      p_cta_ratings: Array.isArray(body.cta_ratings) ? body.cta_ratings : [],
      p_assessment_ratings: Array.isArray(body.assessment_ratings) ? body.assessment_ratings : [],
      p_action_id: body.action_id ?? null,
      p_outcome_classification: body.outcome_classification ?? null,
    })

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('POST /api/calls/attempts error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record call attempt' },
      { status: 500 }
    )
  }
}
