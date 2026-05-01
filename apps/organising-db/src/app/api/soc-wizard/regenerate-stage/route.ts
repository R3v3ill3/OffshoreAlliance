/**
 * POST /api/soc-wizard/regenerate-stage
 *
 * Wipes coaching turns and any locked content for a specific
 * (session, stage_number, hope_frame). The frontend then opens a fresh
 * coach stream via /api/soc-wizard/coach.
 *
 * Body: {
 *   session_id: number,
 *   stage_number: 1..8,
 *   hope_frame?: 'opportunity'|'plan'|'dont_take_lolly'
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOPE_FRAMES = ['opportunity', 'plan', 'dont_take_lolly'] as const
type HopeFrame = typeof HOPE_FRAMES[number]

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { session_id, stage_number, hope_frame, population_index: rawPopulationIndex } = await req.json()
    if (!Number.isInteger(session_id)) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }
    if (!Number.isInteger(stage_number) || stage_number < 1 || stage_number > 8) {
      return NextResponse.json({ error: 'stage_number must be 1..8' }, { status: 400 })
    }
    if (stage_number === 5 && !HOPE_FRAMES.includes(hope_frame)) {
      return NextResponse.json(
        { error: 'hope_frame is required when stage_number === 5' },
        { status: 400 }
      )
    }
    if (stage_number !== 5 && hope_frame) {
      return NextResponse.json(
        { error: 'hope_frame is only valid when stage_number === 5' },
        { status: 400 }
      )
    }

    const hopeFrame = stage_number === 5 ? (hope_frame as HopeFrame) : null
    const populationIndex: number | null = stage_number !== 5 ? (rawPopulationIndex ?? null) : null

    // Delete chat turns
    {
      let q = supabase
        .from('soc_chat_turns')
        .delete()
        .eq('session_id', session_id)
        .eq('stage_number', stage_number)
      q = hopeFrame === null ? q.is('hope_frame', null) : q.eq('hope_frame', hopeFrame)
      q = populationIndex === null ? q.is('population_index', null) : q.eq('population_index', populationIndex)
      const { error } = await q
      if (error) throw error
    }

    // Delete locked content
    {
      let q = supabase
        .from('soc_stage_content')
        .delete()
        .eq('session_id', session_id)
        .eq('stage_number', stage_number)
      q = hopeFrame === null ? q.is('hope_frame', null) : q.eq('hope_frame', hopeFrame)
      q = populationIndex === null ? q.is('population_index', null) : q.eq('population_index', populationIndex)
      const { error } = await q
      if (error) throw error
    }

    // Touch the session
    await supabase
      .from('soc_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('session_id', session_id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('SOC regenerate-stage error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
