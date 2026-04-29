/**
 * POST /api/soc-wizard/suggest-draft
 *
 * One-shot endpoint that asks the coach to generate a starting draft for
 * a specific (session, stage, hope_frame). The draft is meant as a sturdy
 * first pass for the organiser to refine — the AI is explicitly NOT the
 * expert on workforce-specific language. Phrases where the user's
 * judgment matters most (tone, sector lingo, strategic choices) come back
 * as structured `focus_phrases` so the wizard can highlight them in the
 * "edit this draft" preview.
 *
 * Persists the result as an assistant turn in soc_chat_turns with
 * ai_metadata = { kind: 'draft_suggestion', draft_text, focus_phrases }
 * so it lives in the chat history and survives reload.
 *
 * Body: {
 *   session_id: number,
 *   stage_number: 1..8,
 *   hope_frame?: 'opportunity'|'plan'|'dont_take_lolly'
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { OA_CONTEXT, VARIABLE_GLOSSARY } from '@/lib/prompts/draft-prompts'
import {
  SOC_FRAMEWORK,
  SOC_STAGE_NAMES,
  type HopeFrame,
  type SocStage,
} from '@/lib/prompts/soc-framework'
import {
  STAGE_COACHING,
  HOPE_FRAME_COACHING,
} from '@/lib/prompts/soc/coaching'
import {
  buildPopulationContext,
  type SocSessionPopulation,
} from '@/lib/prompts/soc/populations'
import { renderSituationContext } from '@/lib/situation-analysis/serialise'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HOPE_FRAMES = ['opportunity', 'plan', 'dont_take_lolly'] as const

const FOCUS_REASON = ['tone', 'sector_language', 'judgment'] as const
type FocusReason = (typeof FOCUS_REASON)[number]

interface FocusPhrase {
  phrase: string
  reason: FocusReason
  note: string
}

interface SuggestionResult {
  commentary: string
  draft_text: string
  focus_phrases: FocusPhrase[]
}

const SUGGEST_INSTRUCTIONS = `
You are generating a STARTING DRAFT of language for one stage of a
Structured Organising Conversation. The organiser will then edit it.

Your job is NOT to write a polished script — it is to give the organiser
something sturdy enough to react to and refine. The organiser is the
expert on this specific workforce, agreement, and history; you are not.

Critical principles:
- Workforce language is highly idiosyncratic. Acronyms, sector terms,
  and idiom that sound right to an outsider often flag someone as
  inexperienced to the actual crew. When you use sector-specific terms
  (e.g. "shutdown crew", "green hat", "FIFO swing", agreement-specific
  names, union acronyms), FLAG THEM as focus_phrases with reason
  "sector_language" so the user can verify the term is used correctly
  for THIS workforce.
- Tone is contextual. The right register depends on who the worker is,
  how long the organiser has known them, and what stage of the campaign
  they are in. When you make a tone choice (e.g. casual vs. formal,
  hard agitation vs. soft probing), flag it as "tone".
- Strategic choices (which issue to lead with, how hard to push for the
  ask, which Hope frame to lean on) are the organiser's call. When you
  make one, flag it as "judgment".

Length: keep the draft short. A stage opener is one to four sentences,
not a paragraph. The organiser will iterate.

You MUST respond in valid JSON ONLY, with this exact shape:
{
  "commentary": "1-2 sentences directly to the organiser. Name what you focused on and tell them the highlighted phrases are places where your judgment is uncertain.",
  "draft_text": "The suggested draft language for this stage. Plain text, no markdown.",
  "focus_phrases": [
    {
      "phrase": "exact substring of draft_text — must match character-for-character",
      "reason": "tone" | "sector_language" | "judgment",
      "note": "1 sentence telling the organiser what to verify or refine here"
    }
  ]
}

Guarantee: every "phrase" must be a verbatim substring of "draft_text"
(case-sensitive). If a phrase isn't in the draft you wrote, the highlight
won't render and the organiser loses signal. Quote the draft exactly.

Aim for 2-5 focus_phrases. Don't pad. If a draft is short and
uncontroversial, returning 1-2 phrases (or zero) is fine.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      )
    }

    const { session_id, stage_number, hope_frame } = (await req.json()) as {
      session_id: number
      stage_number: number
      hope_frame?: HopeFrame
    }

    if (!Number.isInteger(session_id)) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    }
    if (!Number.isInteger(stage_number) || stage_number < 1 || stage_number > 8) {
      return NextResponse.json(
        { error: 'stage_number must be 1..8' },
        { status: 400 }
      )
    }
    if (
      stage_number === 5 &&
      (!hope_frame || !HOPE_FRAMES.includes(hope_frame))
    ) {
      return NextResponse.json(
        { error: 'hope_frame required when stage_number === 5' },
        { status: 400 }
      )
    }
    const hopeFrame: HopeFrame | null =
      stage_number === 5 ? (hope_frame as HopeFrame) : null

    // Load session — RLS enforces visibility
    const { data: session, error: sessionErr } = await supabase
      .from('soc_sessions')
      .select(
        'session_id, campaign_id, target_populations, context_snapshot, custom_situation'
      )
      .eq('session_id', session_id)
      .maybeSingle()
    if (sessionErr || !session) {
      return NextResponse.json(
        { error: 'Session not found or no access' },
        { status: 404 }
      )
    }

    // Build context summary (mirrors the coach route — keep them in step)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = (session.context_snapshot ?? {}) as any
    const customSituation = (session.custom_situation as string | null) ?? null
    const contextLines: string[] = ['CAMPAIGN CONTEXT']
    if (customSituation) contextLines.push(`Situation: ${customSituation}`)
    if (snapshot.campaign?.name) contextLines.push(`Campaign: ${snapshot.campaign.name}`)
    if (snapshot.agreement?.agreement_name) contextLines.push(`Agreement: ${snapshot.agreement.agreement_name}`)
    if (snapshot.organiser?.organiser_name) contextLines.push(`Lead organiser: ${snapshot.organiser.organiser_name}`)
    if (snapshot.stage?.stage_number)
      contextLines.push(`Planner stage: ${snapshot.stage.stage_number} — ${snapshot.stage.stage_name ?? ''}`)
    if (Array.isArray(snapshot.ambitions)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = snapshot.ambitions.slice(0, 6).map((x: any) => x.custom_text).filter(Boolean)
      if (a.length > 0) contextLines.push(`Stage ambitions:\n${a.map((t: string) => `  - ${t}`).join('\n')}`)
    }
    if (snapshot.situation_analysis) {
      const sa = snapshot.situation_analysis as Record<string, unknown>
      const rendered =
        (typeof sa.rendered_context === 'string' && sa.rendered_context) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderSituationContext(sa as any)
      if (rendered) {
        contextLines.push('')
        contextLines.push(rendered)
      }
    }

    const stageCoaching = STAGE_COACHING[stage_number as SocStage]
    const hopeCoaching = hopeFrame ? HOPE_FRAME_COACHING[hopeFrame] : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const populations = (session.target_populations || []) as SocSessionPopulation[]
    const stageDisplay =
      stage_number === 5 && hopeFrame
        ? `Stage 5 (Hope) — ${HOPE_FRAME_COACHING[hopeFrame].name}`
        : `Stage ${stage_number} (${SOC_STAGE_NAMES[stage_number as SocStage]})`

    const systemBlock = [
      OA_CONTEXT,
      '',
      `You are generating a starting draft for ${stageDisplay} of a Structured Organising Conversation.`,
      SUGGEST_INSTRUCTIONS,
      '',
      VARIABLE_GLOSSARY,
      '',
      SOC_FRAMEWORK,
      '',
      stageCoaching.coach_directives,
      'Signals of success for this stage:',
      ...stageCoaching.signals_of_success.map((s) => `- ${s}`),
      'Common failures to avoid in your draft:',
      ...stageCoaching.common_failures.map((s) => `- ${s}`),
      '',
      hopeCoaching ? hopeCoaching.coach_directives : '',
      '',
      buildPopulationContext(populations),
      '',
      contextLines.join('\n'),
    ]
      .filter(Boolean)
      .join('\n')

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: [
        {
          type: 'text',
          text: systemBlock,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Generate a starting draft for ${stageDisplay}. Respond in JSON only.`,
        },
      ],
    })

    const block = completion.content[0]
    if (!block || block.type !== 'text') {
      throw new Error('Unexpected response from Claude')
    }
    let parsed: SuggestionResult
    try {
      parsed = JSON.parse(block.text) as SuggestionResult
    } catch {
      const start = block.text.indexOf('{')
      const end = block.text.lastIndexOf('}')
      if (start === -1 || end === -1)
        throw new Error('Could not parse JSON from Claude response')
      parsed = JSON.parse(block.text.slice(start, end + 1)) as SuggestionResult
    }

    // Validate + normalise focus_phrases — drop any whose phrase isn't a
    // substring of draft_text (so the highlight won't fail silently).
    const draftText = String(parsed.draft_text ?? '').trim()
    if (!draftText) throw new Error('Empty draft_text')
    const commentary = String(parsed.commentary ?? '').trim()
    const focusPhrases: FocusPhrase[] = Array.isArray(parsed.focus_phrases)
      ? parsed.focus_phrases
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any): FocusPhrase | null => {
            const phrase = String(p?.phrase ?? '').trim()
            const reason = (FOCUS_REASON as readonly string[]).includes(p?.reason)
              ? (p.reason as FocusReason)
              : 'judgment'
            const note = String(p?.note ?? '').trim()
            if (!phrase) return null
            if (!draftText.includes(phrase)) return null
            return { phrase, reason, note }
          })
          .filter((x): x is FocusPhrase => x !== null)
      : []

    // Persist as an assistant turn at the next turn_index for this scope.
    let priorQuery = supabase
      .from('soc_chat_turns')
      .select('turn_index')
      .eq('session_id', session_id)
      .eq('stage_number', stage_number)
      .order('turn_index', { ascending: false })
      .limit(1)
    priorQuery =
      hopeFrame === null
        ? priorQuery.is('hope_frame', null)
        : priorQuery.eq('hope_frame', hopeFrame)
    const { data: prior } = await priorQuery
    const nextTurnIndex =
      Array.isArray(prior) && prior.length > 0 ? prior[0].turn_index + 1 : 0

    const { data: insertedTurn, error: insertErr } = await supabase
      .from('soc_chat_turns')
      .insert({
        session_id,
        stage_number,
        hope_frame: hopeFrame,
        turn_index: nextTurnIndex,
        role: 'assistant',
        content: commentary || 'Here is a starting draft. The amber-highlighted phrases are places where your judgment matters most — verify the sector language and tone for this workforce before locking.',
        ai_metadata: {
          kind: 'draft_suggestion',
          draft_text: draftText,
          focus_phrases: focusPhrases,
          model: 'claude-sonnet-4-20250514',
        },
      })
      .select()
      .single()
    if (insertErr) throw insertErr

    return NextResponse.json({
      turn_index: insertedTurn.turn_index,
      commentary: insertedTurn.content,
      draft_text: draftText,
      focus_phrases: focusPhrases,
    })
  } catch (error) {
    console.error('SOC suggest-draft error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
