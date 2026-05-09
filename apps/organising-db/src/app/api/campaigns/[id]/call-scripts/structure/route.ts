import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { SOC_FRAMEWORK } from '@/lib/prompts/soc-framework'
import { PHONE_SCRIPT_MODEL } from '@/lib/ai/models'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are an expert at structuring phone scripts for union organising campaigns.

Given a flat phone script text, you must parse it into structured sections aligned with the Structured Organising Conversation (SOC) framework.

${SOC_FRAMEWORK}

Each section you output must have:
- section_type: one of "opening", "introduction", "discovery", "education", "ask", "objection_handling", "close", or "custom"
- title: a short descriptive title for the section
- body_text: the full script text for that section
- talking_points: an array of 2-5 key bullet points the caller should remember
- prompt_text: a single short sentence (max 80 chars) shown to the caller as a quick reference during the call
- expected_outcomes: an array of possible outcomes at this point (e.g. ["positive_response", "objection_raised", "disengaged"])
- is_optional: boolean, true if this section can be skipped
- sort_order: integer starting from 0

You MUST respond with valid JSON matching this schema:
{
  "sections": [
    {
      "sort_order": 0,
      "section_type": "opening",
      "title": "...",
      "body_text": "...",
      "talking_points": ["...", "..."],
      "prompt_text": "...",
      "expected_outcomes": ["..."],
      "is_optional": false
    }
  ]
}

Guidelines:
- Always include at minimum: opening, discovery/issues, ask, and close sections
- If the script text doesn't clearly map to a SOC step, use "custom"
- Keep prompt_text concise — it's shown in a small space during active calling
- talking_points should be actionable reminders, not full paragraphs
- Preserve the original script wording in body_text; don't rewrite it`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      )
    }

    const body = await req.json()
    let scriptText = body.body_text || ''

    if (!scriptText && body.draft_id) {
      const { data: draft } = await supabase
        .from('campaign_comms_drafts')
        .select('body')
        .eq('draft_id', body.draft_id)
        .single()

      if (draft?.body) {
        scriptText = draft.body
      }
    }

    if (!scriptText) {
      return NextResponse.json(
        { error: 'Either body_text or a valid draft_id is required' },
        { status: 400 }
      )
    }

    const contextInfo = body.campaign_context
      ? `\n\nCampaign context: ${body.campaign_context.employer_name || ''}, ${body.campaign_context.agreement_name || ''}, Stage: ${body.campaign_context.stage_name || ''}`
      : ''

    const response = await anthropic.messages.create({
      model: PHONE_SCRIPT_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Parse the following phone script into structured SOC-aligned sections:${contextInfo}\n\n---\n${scriptText}\n---`,
      }],
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

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Structure script error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
