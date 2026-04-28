import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { CommsDraftRequest, CommsPlatform } from '@/types/planner-types'
import { buildEmailPrompt, buildSmsPrompt, buildPhoneScriptPrompt } from '@/lib/prompts/draft-prompts'
import { loadSituationContextString } from '@/lib/situation-analysis/serialise'

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

    const body: CommsDraftRequest = await req.json()

    if (!body.platform || !PROMPT_BUILDERS[body.platform]) {
      return NextResponse.json(
        { error: `Invalid platform. Must be one of: email, sms, phone_script` },
        { status: 400 }
      )
    }

    if (!body.campaign_context?.employer_name) {
      return NextResponse.json(
        { error: 'Missing required campaign context (employer_name)' },
        { status: 400 }
      )
    }
    // Ensure agreement_name always has a value so prompts render cleanly
    if (!body.campaign_context.agreement_name) {
      body.campaign_context.agreement_name = 'Independent Organising'
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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
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
