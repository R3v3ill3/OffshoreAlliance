/**
 * POST /api/soc-wizard/lock-stage
 *
 * Upsert the locked content for one (session, stage_number, hope_frame).
 * If all 8 stages (with all 3 Hope frames present) are locked, also flips
 * the parent soc_sessions.status to 'complete'.
 *
 * Body: {
 *   session_id: number,
 *   stage_number: 1..8,
 *   hope_frame?: 'opportunity'|'plan'|'dont_take_lolly',  // required when stage_number === 5
 *   stage_name: string,
 *   locked_content: string,
 *   organiser_notes?: string,
 *   populations_targeted?: unknown[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOPE_FRAMES = ['opportunity', 'plan', 'dont_take_lolly'] as const
type HopeFrame = typeof HOPE_FRAMES[number]

interface LockStageBody {
  session_id: number
  stage_number: number
  hope_frame?: HopeFrame | null
  stage_name: string
  locked_content: string
  organiser_notes?: string | null
  populations_targeted?: unknown[]
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as LockStageBody

    if (!body.session_id || !Number.isInteger(body.session_id)) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }
    if (!Number.isInteger(body.stage_number) || body.stage_number < 1 || body.stage_number > 8) {
      return NextResponse.json({ error: 'stage_number must be 1..8' }, { status: 400 })
    }
    if (!body.locked_content || typeof body.locked_content !== 'string') {
      return NextResponse.json({ error: 'locked_content is required' }, { status: 400 })
    }
    if (body.stage_number === 5 && !HOPE_FRAMES.includes(body.hope_frame as HopeFrame)) {
      return NextResponse.json(
        { error: 'hope_frame is required when stage_number === 5' },
        { status: 400 }
      )
    }
    if (body.stage_number !== 5 && body.hope_frame) {
      return NextResponse.json(
        { error: 'hope_frame is only valid when stage_number === 5' },
        { status: 400 }
      )
    }

    const hopeFrame = body.stage_number === 5 ? (body.hope_frame as HopeFrame) : null

    // Upsert via delete + insert. PostgREST upsert with a composite key
    // including NULL is awkward; this is the simplest correct approach.
    // RLS prevents cross-session writes.
    {
      let q = supabase
        .from('soc_stage_content')
        .delete()
        .eq('session_id', body.session_id)
        .eq('stage_number', body.stage_number)
      q = hopeFrame === null ? q.is('hope_frame', null) : q.eq('hope_frame', hopeFrame)
      const { error: delErr } = await q
      if (delErr) throw delErr
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('soc_stage_content')
      .insert({
        session_id: body.session_id,
        stage_number: body.stage_number,
        hope_frame: hopeFrame,
        stage_name: body.stage_name,
        locked_content: body.locked_content,
        organiser_notes: body.organiser_notes ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        populations_targeted: (body.populations_targeted ?? []) as any,
        locked_by: user.id,
      })
      .select()
      .single()

    if (insertErr) throw insertErr

    // Touch the session
    await supabase
      .from('soc_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('session_id', body.session_id)

    // Check completeness: 8 stages, with stage 5 needing all three hope frames
    const { data: locked } = await supabase
      .from('soc_stage_content')
      .select('stage_number, hope_frame')
      .eq('session_id', body.session_id)

    const lockedRows = locked || []
    const stagesLocked = new Set<number>()
    const hopeFramesLocked = new Set<HopeFrame>()
    for (const r of lockedRows) {
      if (r.stage_number !== 5) stagesLocked.add(r.stage_number)
      else if (r.hope_frame) hopeFramesLocked.add(r.hope_frame as HopeFrame)
    }
    const allComplete =
      [1, 2, 3, 4, 6, 7, 8].every((n) => stagesLocked.has(n)) &&
      HOPE_FRAMES.every((f) => hopeFramesLocked.has(f))

    if (allComplete) {
      await supabase
        .from('soc_sessions')
        .update({ status: 'complete', updated_at: new Date().toISOString() })
        .eq('session_id', body.session_id)
    }

    return NextResponse.json({ content: inserted, complete: allComplete })
  } catch (error) {
    console.error('SOC lock-stage error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
