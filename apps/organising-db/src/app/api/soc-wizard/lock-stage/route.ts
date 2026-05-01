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
  population_index?: number | null
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
    if (body.stage_number === 5 && body.population_index != null) {
      return NextResponse.json(
        { error: 'population_index is not valid when stage_number === 5' },
        { status: 400 }
      )
    }

    const hopeFrame = body.stage_number === 5 ? (body.hope_frame as HopeFrame) : null
    const populationIndex = body.stage_number !== 5 ? (body.population_index ?? null) : null

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
      q = populationIndex === null ? q.is('population_index', null) : q.eq('population_index', populationIndex)
      const { error: delErr } = await q
      if (delErr) throw delErr
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('soc_stage_content')
      .insert({
        session_id: body.session_id,
        stage_number: body.stage_number,
        hope_frame: hopeFrame,
        population_index: populationIndex,
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

    // Check completeness: all 8 stages locked, with stage 5 needing all 3 hope
    // frames and stages 1-4/6-8 needing one row per population (or one NULL row
    // if no populations are defined for this session).
    const [{ data: locked }, { data: sessionForCheck }] = await Promise.all([
      supabase
        .from('soc_stage_content')
        .select('stage_number, hope_frame, population_index')
        .eq('session_id', body.session_id),
      supabase
        .from('soc_sessions')
        .select('target_populations')
        .eq('session_id', body.session_id)
        .maybeSingle(),
    ])

    const lockedRows = locked || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const populations = ((sessionForCheck?.target_populations as any[]) || [])
    const popCount = populations.length

    const expected = new Set<string>()
    for (const s of [1, 2, 3, 4, 6, 7, 8]) {
      if (popCount > 0) {
        for (let i = 0; i < popCount; i++) expected.add(`${s}:null:${i}`)
      } else {
        expected.add(`${s}:null:null`)
      }
    }
    for (const f of HOPE_FRAMES) expected.add(`5:${f}:null`)

    for (const r of lockedRows) {
      const key = `${r.stage_number}:${r.hope_frame ?? 'null'}:${r.population_index ?? 'null'}`
      expected.delete(key)
    }
    const allComplete = expected.size === 0

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
