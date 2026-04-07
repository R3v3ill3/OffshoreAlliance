import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are analysing a communication template for the Offshore Alliance, a joint AWU/MUA union initiative in Australia's offshore oil and gas sector. Their campaigns follow a 6-stage model: 1) Contact ID & Mapping, 2) Intro Comms & Education, 3) Member Mobilisation, 4) Develop Claims/MSD, 5) Endorsement & Commence Bargaining, 6) Bargaining to Win.

Analyse the provided template content and return a JSON object with the following fields:

- "stage_number": number 1-6 or null if unclear. Which campaign stage this template is most suited for.
- "tone_tags": array of strings from EXACTLY these values: "informative", "urgency", "shared_responsibility", "success_story", "solidarity", "fairness", "worker_voice", "job_security". Select all that apply.
- "audience_segment": one string from EXACTLY these values: "existing_members", "lapsed_members", "non_members_known", "non_members_unknown", "all_workers", "bargaining_reps", "hsrs", "delegates", "marine_workers", "catering_workers". Pick the best fit.
- "activity_type": one string from EXACTLY these values: "first_contact", "education", "mobilisation", "bargaining_update", "action_alert", "survey", "meeting_invite", "membership_check", "general_update". Pick the best fit.
- "variables": array of variable names detected in the template (strings inside {{double_braces}}, without the braces).
- "platform": confirm or suggest one of "email", "sms", "phone_script" based on the content length and style.

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
        { error: 'Anthropic API key not configured. Please add ANTHROPIC_API_KEY to your environment variables.' },
        { status: 500 },
      )
    }

    const body = await req.json()
    const { content, platform } = body as { content: string; platform?: string }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const userMessage = `Template content:
---
${content.slice(0, 8000)}
---
${platform ? `\nThe user has indicated this is for platform: ${platform}` : ''}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
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

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Template analyse API error:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
