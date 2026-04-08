import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are a communications specialist for the Offshore Alliance (OA), a joint AWU/MUA union initiative in Australia's offshore oil and gas sector.

You are adapting an existing email template to match specific campaign "Where to Play" selections. The user will provide:
1. The original template text
2. The campaign's Where to Play context (tone, audience, engagement intensity)
3. The campaign stage

Your job is to suggest specific edits that adapt the template to the campaign context while preserving the template's structure and key messaging. Return a JSON object with:

- "adapted_subject": string or null. Adapted subject line (only if the original has one).
- "adapted_body_text": string. The full adapted body text.
- "adapted_body_html": string or null. Adapted HTML body if the original has HTML.
- "changes_summary": array of objects, each with:
  - "location": string (e.g. "opening paragraph", "call to action", "sign-off")
  - "original_snippet": string (short excerpt of original text)
  - "adapted_snippet": string (what it was changed to)
  - "reason": string (why this change was made based on WTP context)
- "tone_applied": string. Which tone(s) guided the adaptation.
- "audience_targeted": string. Which audience segment the adaptation targets.

Preserve template variables in {{variable_name}} format. Keep the email's core message intact. Make targeted, purposeful edits -- don't rewrite everything.

Respond with ONLY valid JSON, no markdown formatting or explanation.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 },
      )
    }

    const body = await req.json()
    const {
      template_id,
      subject_line,
      body_text,
      body_html,
      stage_number,
      stage_name,
      wtp_selections,
      custom_instructions,
    } = body as {
      template_id?: number
      subject_line?: string
      body_text: string
      body_html?: string
      stage_number: number
      stage_name: string
      wtp_selections: {
        tone: string[]
        audience: string[]
        platforms: string[]
        engagement_intensity?: string
      }
      custom_instructions?: string
    }

    if (!body_text) {
      return NextResponse.json({ error: 'body_text is required' }, { status: 400 })
    }

    const userMessage = `Campaign Stage: ${stage_number} — ${stage_name}

WHERE TO PLAY CONTEXT:
Tone: ${wtp_selections.tone.length > 0 ? wtp_selections.tone.join(', ') : 'Not specified'}
Target Audience: ${wtp_selections.audience.length > 0 ? wtp_selections.audience.join(', ') : 'All workers'}
Engagement Intensity: ${wtp_selections.engagement_intensity || 'Not specified'}
Platforms: ${wtp_selections.platforms.join(', ') || 'Email'}

ORIGINAL TEMPLATE:
${subject_line ? `Subject: ${subject_line}\n` : ''}
--- Body Text ---
${body_text.slice(0, 8000)}
---
${body_html ? `\n--- Body HTML ---\n${body_html.slice(0, 8000)}\n---` : ''}
${custom_instructions ? `\nADDITIONAL INSTRUCTIONS:\n${custom_instructions}` : ''}

Please adapt this template to match the Where to Play context above.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const responseContent = response.content[0]
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    let parsed
    try {
      parsed = JSON.parse(responseContent.text)
    } catch {
      const jsonMatch = responseContent.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        const jsonStart = responseContent.text.indexOf('{')
        const jsonEnd = responseContent.text.lastIndexOf('}')
        if (jsonStart !== -1 && jsonEnd !== -1) {
          parsed = JSON.parse(responseContent.text.slice(jsonStart, jsonEnd + 1))
        } else {
          throw new Error('Could not parse JSON from Claude response')
        }
      }
    }

    return NextResponse.json({ ...parsed, template_id })
  } catch (error) {
    console.error('Template customise API error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
