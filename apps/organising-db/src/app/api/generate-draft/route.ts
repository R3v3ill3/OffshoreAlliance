import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { CommsDraftRequest, CommsPlatform } from '@/types/planner-types'
import { buildEmailPrompt, buildSmsPrompt, buildPhoneScriptPrompt } from '@/lib/prompts/draft-prompts'
import { buildTransformPrompt, buildSubjectVariantsPrompt, type TransformAction } from '@/lib/prompts/email-transform-prompts'
import { loadSituationContextString } from '@/lib/situation-analysis/serialise'

interface TransformRequestBody {
  mode: 'transform'
  text: string
  action: TransformAction
  scope?: 'selection' | 'whole_body'
}

interface SubjectVariantsRequestBody {
  mode: 'subject_variants'
  body_text: string
  hint?: string
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const PROMPT_BUILDERS: Record<CommsPlatform, (req: CommsDraftRequest) => { system: string; user: string }> = {
  email: buildEmailPrompt,
  sms: buildSmsPrompt,
  phone_script: buildPhoneScriptPrompt,
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured. Please add ANTHROPIC_API_KEY to your environment variables.' },
        { status: 500 }
      )
    }

    const rawBody = await req.json()

    // ---- Mode dispatch ----------------------------------------------
    // 'transform' and 'subject_variants' are auxiliary modes for the
    // email composer's selection-toolbar and subject-ideas actions.
    // They share the Anthropic client + auth gate but skip the
    // full draft-prompt pipeline.
    if (rawBody?.mode === 'transform') {
      return handleTransform(rawBody as TransformRequestBody)
    }
    if (rawBody?.mode === 'subject_variants') {
      return handleSubjectVariants(rawBody as SubjectVariantsRequestBody)
    }

    const body: CommsDraftRequest = rawBody

    if (!body.platform || !PROMPT_BUILDERS[body.platform]) {
      return NextResponse.json(
        { error: `Invalid platform. Must be one of: email, sms, phone_script` },
        { status: 400 }
      )
    }

    // Provide sensible fallbacks so prompts always render cleanly. Campaigns
    // without a campaign_timelines → agreements → employer chain (common for
    // organising-type campaigns) used to hard-fail here with a 400; we now
    // synthesize defaults and let the prompt's narrative context (set by the
    // caller via custom_instructions / situation_analysis_context) carry the
    // weight.
    if (!body.campaign_context) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(body as any).campaign_context = {}
    }
    if (!body.campaign_context.employer_name) {
      body.campaign_context.employer_name = 'the campaign workforce'
    }
    if (!body.campaign_context.agreement_name) {
      body.campaign_context.agreement_name = 'Independent Organising'
    }
    if (!body.campaign_context.sector) {
      body.campaign_context.sector = 'offshore oil & gas'
    }
    if (!Array.isArray(body.campaign_context.worksite_names)) {
      body.campaign_context.worksite_names = []
    }

    // Auto-load the campaign's saved situation analysis as additional
    // context unless the caller has already supplied one. Predicted
    // employer playbook moves become inoculation lines in the draft;
    // top issues become agitation hooks; populations drive audience
    // pacing — the explicit SOC pay-off of the wizard step.
    if (!body.situation_analysis_context && body.campaign_id) {
      const ctx = await loadSituationContextString(supabase, body.campaign_id)
      if (ctx) body.situation_analysis_context = ctx
    }

    const { system, user: userMessage } = PROMPT_BUILDERS[body.platform](body)

    // Phone scripts need significantly more tokens than emails or SMS —
    // the full 8-stage SOC structure with EAR objections and inoculation
    // easily exceeds 2 000 tokens, which truncates the JSON mid-string.
    const MAX_TOKENS_BY_PLATFORM: Record<CommsPlatform, number> = {
      sms: 500,
      email: 2000,
      phone_script: 6000,
    }
    const maxTokens = MAX_TOKENS_BY_PLATFORM[body.platform]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `The ${body.platform} draft exceeded the token limit and was truncated. Please try again with shorter custom instructions or contact support.`
      )
    }

    let parsed
    try {
      parsed = JSON.parse(content.text)
    } catch {
      const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        const jsonStart = content.text.indexOf('{')
        const jsonEnd = content.text.lastIndexOf('}')
        if (jsonStart !== -1 && jsonEnd !== -1) {
          parsed = JSON.parse(content.text.slice(jsonStart, jsonEnd + 1))
        } else {
          throw new Error('Could not parse JSON from Claude response')
        }
      }
    }

    parsed.platform = body.platform

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Generate Draft API error:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleTransform(body: TransformRequestBody): Promise<NextResponse> {
  if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json(
      { success: false, error: 'No text supplied to transform.' },
      { status: 400 },
    )
  }
  if (!body.action) {
    return NextResponse.json(
      { success: false, error: 'Missing action.' },
      { status: 400 },
    )
  }
  try {
    const { system, user } = buildTransformPrompt({
      text: body.text,
      action: body.action,
      scope: body.scope ?? 'selection',
    })
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    const transformed = content.text.trim().replace(/^```[\w]*\n?|\n?```$/g, '')
    return NextResponse.json({ success: true, transformed })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Transform failed',
      },
      { status: 500 },
    )
  }
}

async function handleSubjectVariants(
  body: SubjectVariantsRequestBody,
): Promise<NextResponse> {
  if (!body.body_text || !body.body_text.trim()) {
    return NextResponse.json(
      { success: false, error: 'No body text supplied for subject variants.' },
      { status: 400 },
    )
  }
  try {
    const { system, user } = buildSubjectVariantsPrompt({
      bodyText: body.body_text,
      hint: body.hint,
    })
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    const raw = content.text.trim()
    const variants = parseSubjectVariants(raw)
    return NextResponse.json({ success: true, variants })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Subject variant generation failed',
      },
      { status: 500 },
    )
  }
}

function parseSubjectVariants(text: string): string[] {
  // Accept any of: JSON array, numbered list, line-separated list.
  try {
    const trimmed = text.trim()
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as unknown
      if (Array.isArray(arr)) {
        return arr.map(String).map(stripBullet).filter(Boolean).slice(0, 5)
      }
    }
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      const arr = JSON.parse(jsonMatch[1]) as unknown
      if (Array.isArray(arr)) {
        return arr.map(String).map(stripBullet).filter(Boolean).slice(0, 5)
      }
    }
  } catch {
    // fall through to line-parse
  }
  return text
    .split(/\r?\n/)
    .map((l) => stripBullet(l.trim()))
    .filter((l) => l.length > 0 && l.length < 200)
    .slice(0, 5)
}

function stripBullet(s: string): string {
  return s
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^["“”']|["“”']$/g, '')
    .trim()
}
