/**
 * POST /api/soc-wizard/coach
 *
 * Multi-turn streaming coaching endpoint. The user is working on one
 * specific (session, stage_number, hope_frame) and sends a single new
 * user turn; the AI coach replies in 1-3 sentences, asking for refinement
 * or affirming readiness to lock the stage.
 *
 * Streaming format: text/event-stream with these events
 *   event: turn_open    {"turn_index": <n>, "role": "assistant"}
 *   event: delta        {"text": "..."}                          (repeated)
 *   event: turn_close   {"turn_index": <n>, "stop_reason": "...", "usage": {...}}
 *   event: turn_error   {"message": "..."}                       (only on error)
 *
 * Body: {
 *   session_id: number,
 *   stage_number: 1..8,
 *   hope_frame?: 'opportunity'|'plan'|'dont_take_lolly',  // required when stage_number === 5
 *   user_message: string
 * }
 *
 * On client disconnect, the in-flight Anthropic stream is aborted and
 * the (orphaned) user turn remains in the DB but no assistant turn is
 * persisted. The next coach call will pick up from where it left off.
 */

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { OA_CONTEXT, VARIABLE_GLOSSARY } from '@/lib/prompts/draft-prompts'
import { SOC_FRAMEWORK, SOC_STAGE_NAMES, type HopeFrame, type SocStage } from '@/lib/prompts/soc-framework'
import { STAGE_COACHING, HOPE_FRAME_COACHING, COACH_BEHAVIOUR_BLOCK } from '@/lib/prompts/soc/coaching'
import { buildPopulationContext, type SocSessionPopulation } from '@/lib/prompts/soc/populations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HOPE_FRAMES = ['opportunity', 'plan', 'dont_take_lolly'] as const

const encoder = new TextEncoder()

function sseEvent(event: string, data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function buildContextSummary(snapshot: Record<string, unknown> | null, customSituation: string | null): string {
  const lines: string[] = ['CAMPAIGN CONTEXT']
  if (!snapshot && !customSituation) {
    return 'CAMPAIGN CONTEXT\n(No context provided. The user is using the SOC wizard standalone.)\n'
  }
  if (customSituation) lines.push(`Situation: ${customSituation}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (snapshot || {}) as any
  if (s.campaign?.name) lines.push(`Campaign: ${s.campaign.name}`)
  if (s.agreement?.agreement_name) lines.push(`Agreement: ${s.agreement.agreement_name}`)
  if (s.agreement?.expiry_date) lines.push(`Agreement expiry: ${s.agreement.expiry_date}`)
  if (s.organiser?.organiser_name) lines.push(`Lead organiser: ${s.organiser.organiser_name}`)
  if (s.stage?.stage_number) lines.push(`Planner stage: ${s.stage.stage_number} — ${s.stage.stage_name ?? ''}`)
  if (Array.isArray(s.ambitions) && s.ambitions.length) {
    lines.push('Stage ambitions:')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.ambitions.slice(0, 8).forEach((a: any) => {
      const target = a.target_value ? ` — target ${a.target_value}${a.target_unit ? ' ' + a.target_unit : ''}` : ''
      if (a.custom_text) lines.push(`  - ${a.custom_text}${target}`)
    })
  }
  if (Array.isArray(s.where_to_play) && s.where_to_play.length) {
    lines.push('Where-to-play selections:')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.where_to_play.slice(0, 12).forEach((w: any) => {
      lines.push(`  - [${w.category_name ?? 'misc'}] ${w.option_text || w.custom_text}`)
    })
  }
  if (s.campaign?.notes) lines.push(`Campaign notes: ${s.campaign.notes}`)
  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }

  const body = await req.json()
  const session_id = body.session_id as number
  const stage_number = body.stage_number as number
  const hope_frame = body.hope_frame as HopeFrame | undefined
  const user_message = body.user_message as string

  if (!Number.isInteger(session_id) || !Number.isInteger(stage_number) || !user_message) {
    return new Response(JSON.stringify({ error: 'session_id, stage_number, user_message required' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }
  if (stage_number < 1 || stage_number > 8) {
    return new Response(JSON.stringify({ error: 'stage_number must be 1..8' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }
  if (stage_number === 5 && (!hope_frame || !HOPE_FRAMES.includes(hope_frame))) {
    return new Response(JSON.stringify({ error: 'hope_frame required when stage_number === 5' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }
  const hopeFrame: HopeFrame | null = stage_number === 5 ? (hope_frame as HopeFrame) : null

  // Load session — RLS enforces visibility
  const { data: session, error: sessionErr } = await supabase
    .from('soc_sessions')
    .select('session_id, campaign_id, target_populations, context_snapshot, custom_situation')
    .eq('session_id', session_id)
    .maybeSingle()
  if (sessionErr || !session) {
    return new Response(JSON.stringify({ error: 'Session not found or no access' }), {
      status: 404, headers: { 'content-type': 'application/json' },
    })
  }

  // Load prior turns for this (session, stage, frame)
  let priorQuery = supabase
    .from('soc_chat_turns')
    .select('turn_index, role, content')
    .eq('session_id', session_id)
    .eq('stage_number', stage_number)
    .order('turn_index', { ascending: true })
  priorQuery = hopeFrame === null ? priorQuery.is('hope_frame', null) : priorQuery.eq('hope_frame', hopeFrame)
  const { data: priorTurns, error: priorErr } = await priorQuery
  if (priorErr) {
    return new Response(JSON.stringify({ error: priorErr.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }

  const nextTurnIndex = (priorTurns?.length ?? 0) === 0
    ? 0
    : Math.max(...(priorTurns ?? []).map((t) => t.turn_index)) + 1

  // Persist user turn first (gives an audit trail even if the stream
  // never completes)
  {
    const { error } = await supabase
      .from('soc_chat_turns')
      .insert({
        session_id,
        stage_number,
        hope_frame: hopeFrame,
        turn_index: nextTurnIndex,
        role: 'user',
        content: user_message,
      })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'content-type': 'application/json' },
      })
    }
  }

  // Build the system prompt
  const stageCoaching = STAGE_COACHING[stage_number as SocStage]
  const hopeCoaching = hopeFrame ? HOPE_FRAME_COACHING[hopeFrame] : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const populations = (session.target_populations || []) as SocSessionPopulation[]
  const stageDisplay = stage_number === 5 && hopeFrame
    ? `Stage 5 (Hope) — ${HOPE_FRAME_COACHING[hopeFrame].name}`
    : `Stage ${stage_number} (${SOC_STAGE_NAMES[stage_number as SocStage]})`

  const systemBlock = [
    OA_CONTEXT,
    '',
    `You are coaching an organiser building a Structured Organising Conversation. You are currently on ${stageDisplay}.`,
    COACH_BEHAVIOUR_BLOCK,
    '',
    VARIABLE_GLOSSARY,
    '',
    SOC_FRAMEWORK,
    '',
    stageCoaching.coach_directives,
    'Signals of success for this stage:',
    ...stageCoaching.signals_of_success.map((s) => `- ${s}`),
    'Common failures to push back on:',
    ...stageCoaching.common_failures.map((s) => `- ${s}`),
    `Closing question to ask before locking: "${stageCoaching.closing_question}"`,
    '',
    hopeCoaching ? hopeCoaching.coach_directives : '',
    hopeCoaching ? 'Hope-frame signals of success:' : '',
    ...(hopeCoaching ? hopeCoaching.signals_of_success.map((s) => `- ${s}`) : []),
    hopeCoaching ? 'Hope-frame failures to push back on:' : '',
    ...(hopeCoaching ? hopeCoaching.common_failures.map((s) => `- ${s}`) : []),
    '',
    buildPopulationContext(populations),
    '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildContextSummary(session.context_snapshot as Record<string, unknown>, session.custom_situation as string | null),
  ].filter(Boolean).join('\n')

  // Build messages — prior turns + the new user turn we just persisted
  const messages = [
    ...((priorTurns || []).filter((t) => t.role === 'user' || t.role === 'assistant').map((t) => ({
      role: t.role as 'user' | 'assistant',
      content: t.content,
    }))),
    { role: 'user' as const, content: user_message },
  ]

  // Buffer the assistant text server-side so we can persist it on close
  let assistantBuffer = ''
  let stopReason: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usage: any = null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const assistantTurnIndex = nextTurnIndex + 1
      controller.enqueue(sseEvent('turn_open', { turn_index: assistantTurnIndex, role: 'assistant' }))
      try {
        const aiStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: [
            {
              type: 'text',
              text: systemBlock,
              // Anthropic prompt caching — the system block is stable across
              // turns within this stage, so caching it cuts cost dramatically.
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages,
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const event of aiStream as any) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const txt = event.delta.text as string
            assistantBuffer += txt
            controller.enqueue(sseEvent('delta', { text: txt }))
          } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason
            usage = event.usage
          } else if (event.type === 'message_stop') {
            // final
          }
        }

        // Persist assistant turn
        await supabase.from('soc_chat_turns').insert({
          session_id,
          stage_number,
          hope_frame: hopeFrame,
          turn_index: assistantTurnIndex,
          role: 'assistant',
          content: assistantBuffer,
          ai_metadata: { stop_reason: stopReason, usage, model: 'claude-sonnet-4-20250514' },
        })

        controller.enqueue(sseEvent('turn_close', {
          turn_index: assistantTurnIndex,
          stop_reason: stopReason,
          usage,
        }))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error'
        // Best-effort: persist whatever we got
        if (assistantBuffer.length > 0) {
          await supabase.from('soc_chat_turns').insert({
            session_id,
            stage_number,
            hope_frame: hopeFrame,
            turn_index: assistantTurnIndex,
            role: 'assistant',
            content: assistantBuffer,
            ai_metadata: { error: msg, partial: true },
          }).then(() => undefined, () => undefined)
        }
        controller.enqueue(sseEvent('turn_error', { message: msg }))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
