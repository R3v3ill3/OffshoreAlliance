import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { VARIABLE_GLOSSARY } from '@/lib/prompts/draft-prompts'
import { AI_MODEL } from '@/lib/ai/models'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const EMAIL_SYSTEM_PROMPT = `You are a communications specialist for the Offshore Alliance (OA), a joint AWU/MUA union initiative in Australia's offshore oil and gas sector.

You are adapting an existing email template to match specific campaign "Where to Play" selections. The user will provide:
1. The original template text
2. The campaign's Where to Play context (tone, audience, engagement intensity)
3. The campaign stage

Your job is to suggest specific edits that adapt the template to the campaign context while preserving the template's structure and key messaging. Return a JSON object with:

- "adapted_subject": string or null. Adapted subject line (only if the original has one).
- "adapted_body_text": string. The full adapted PLAIN TEXT body. Do NOT include HTML.
- "changes_summary": array of 3-5 objects (keep brief), each with:
  - "location": string (e.g. "opening", "call to action", "sign-off")
  - "original_snippet": string (max 50 chars of original)
  - "adapted_snippet": string (max 50 chars of replacement)
  - "reason": string (max 80 chars, why changed)
- "tone_applied": string. Which tone(s) guided the adaptation.
- "audience_targeted": string. Which audience segment the adaptation targets.

${VARIABLE_GLOSSARY}

ADDITIONAL ADAPTATION RULES:
- Whatever {{variables}} appear in the original template, the adapted version MUST use the SAME variables in the same semantic slots. Do not replace one variable with a different variable.
- Keep the email's core message intact — make targeted edits, don't rewrite everything
- Keep changes_summary entries SHORT (snippets max 50 chars each)
- Do NOT include any HTML in the response — only plain text
- The response MUST be valid, complete JSON

Respond with ONLY valid JSON, no markdown formatting or explanation.`

const PHONE_SYSTEM_PROMPT = `You are a communications specialist for the Offshore Alliance (OA), a joint AWU/MUA union initiative in Australia's offshore oil and gas sector.

You are adapting an existing phone script template to match specific campaign "Where to Play" selections. The user will provide:
1. The original script text
2. The campaign's Where to Play context (tone, audience, engagement intensity)
3. The campaign stage

Phone scripts are spoken conversations, not written correspondence. Adapt language to be natural when spoken aloud. Return a JSON object with:

- "adapted_subject": null (phone scripts have no subject line).
- "adapted_body_text": string. The full adapted phone script as PLAIN TEXT. Use short sentences, natural spoken language, and section headings like "Opening:", "Issue:", "Ask:".
- "changes_summary": array of 3-5 objects (keep brief), each with:
  - "location": string (e.g. "opening", "issue framing", "ask/close")
  - "original_snippet": string (max 50 chars of original)
  - "adapted_snippet": string (max 50 chars of replacement)
  - "reason": string (max 80 chars, why changed)
- "tone_applied": string. Which tone(s) guided the adaptation.
- "audience_targeted": string. Which audience segment the adaptation targets.

${VARIABLE_GLOSSARY}

ADDITIONAL ADAPTATION RULES:
- Whatever {{variables}} appear in the original script, the adapted version MUST use the SAME variables in the same semantic slots.
- Keep the script's core ask and call objective intact — make targeted edits, don't rewrite everything
- Use conversational, spoken-word language — avoid formal written prose
- Keep changes_summary entries SHORT (snippets max 50 chars each)
- The response MUST be valid, complete JSON

Respond with ONLY valid JSON, no markdown formatting or explanation.`

const SMS_SYSTEM_PROMPT = `You are a communications specialist for the Offshore Alliance (OA), a joint AWU/MUA union initiative in Australia's offshore oil and gas sector.

You are adapting an existing SMS message template to match specific campaign "Where to Play" selections. SMS messages must be concise (typically under 160 characters per segment). Return a JSON object with:

- "adapted_subject": null (SMS messages have no subject line).
- "adapted_body_text": string. The full adapted SMS body as PLAIN TEXT. Keep it brief and impactful.
- "changes_summary": array of 2-4 objects (keep brief), each with:
  - "location": string (e.g. "opening hook", "call to action", "sign-off")
  - "original_snippet": string (max 50 chars of original)
  - "adapted_snippet": string (max 50 chars of replacement)
  - "reason": string (max 80 chars, why changed)
- "tone_applied": string. Which tone(s) guided the adaptation.
- "audience_targeted": string. Which audience segment the adaptation targets.

${VARIABLE_GLOSSARY}

ADDITIONAL ADAPTATION RULES:
- Keep {{variables}} unchanged — same variable in same slot
- Be brief: aim for 1-3 short sentences
- No HTML, no long lists
- The response MUST be valid, complete JSON

Respond with ONLY valid JSON, no markdown formatting or explanation.`

function getSystemPrompt(platform?: string): string {
  switch (platform?.toLowerCase()) {
    case 'phone':
    case 'phone_call':
    case 'phone_script':
      return PHONE_SYSTEM_PROMPT
    case 'sms':
    case 'sms_blast':
      return SMS_SYSTEM_PROMPT
    default:
      return EMAIL_SYSTEM_PROMPT
  }
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
        { error: 'Anthropic API key not configured' },
        { status: 500 },
      )
    }

    const body = await req.json()
    const {
      template_id,
      platform,
      subject_line,
      body_text,
      body_html,
      stage_number,
      stage_name,
      wtp_selections,
      custom_instructions,
      campaign_context,
    } = body as {
      template_id?: number
      /** Communication channel — determines which system prompt is used. Defaults to 'email'. */
      platform?: string
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
      campaign_context?: {
        employer_name?: string
        agreement_name?: string
        worksite_names?: string[]
        organiser_name?: string
        organiser_phone?: string
        staff_name?: string
        staff_email?: string
        staff_phone?: string
        staff_role?: string
      }
    }

    if (!body_text) {
      return NextResponse.json({ error: 'body_text is required' }, { status: 400 })
    }

    const ctxLines: string[] = []
    if (campaign_context?.agreement_name) ctxLines.push(`Agreement Name (the {{agreement_name}}): ${campaign_context.agreement_name}`)
    if (campaign_context?.employer_name) ctxLines.push(`Employer (the {{employer_name}}): ${campaign_context.employer_name}`)
    if (campaign_context?.worksite_names?.length) ctxLines.push(`Worksites (the {{worksite_name}}): ${campaign_context.worksite_names.join(', ')}`)
    if (campaign_context?.organiser_name) ctxLines.push(`Lead Organiser (the {{organiser_name}}): ${campaign_context.organiser_name}`)
    if (campaign_context?.organiser_phone) ctxLines.push(`Lead Organiser Phone (the {{organiser_phone}}): ${campaign_context.organiser_phone}`)
    if (campaign_context?.staff_name) ctxLines.push(`Sending Staff Member (the {{staff_name}}): ${campaign_context.staff_name}`)
    if (campaign_context?.staff_email) ctxLines.push(`Sending Staff Email (the {{staff_email}}): ${campaign_context.staff_email}`)
    if (campaign_context?.staff_phone) ctxLines.push(`Sending Staff Phone (the {{staff_phone}}): ${campaign_context.staff_phone}`)
    if (campaign_context?.staff_role) ctxLines.push(`Sending Staff Role (the {{staff_role}}): ${campaign_context.staff_role}`)

    const campaignContextBlock = ctxLines.length
      ? `CAMPAIGN CONTEXT (real values for the {{variables}} in the template — these will be substituted at send time, do NOT inline them, and do NOT swap one variable for another):\n${ctxLines.join('\n')}\n\n`
      : ''

    const userMessage = `Campaign Stage: ${stage_number} — ${stage_name}

WHERE TO PLAY CONTEXT:
Tone: ${wtp_selections.tone.length > 0 ? wtp_selections.tone.join(', ') : 'Not specified'}
Target Audience: ${wtp_selections.audience.length > 0 ? wtp_selections.audience.join(', ') : 'All workers'}
Engagement Intensity: ${wtp_selections.engagement_intensity || 'Not specified'}
Platforms: ${wtp_selections.platforms.join(', ') || 'Email'}

${campaignContextBlock}ORIGINAL TEMPLATE:
${subject_line ? `Subject: ${subject_line}\n` : ''}
--- Body Text ---
${body_text.slice(0, 6000)}
---
${custom_instructions ? `\nADDITIONAL INSTRUCTIONS:\n${custom_instructions}` : ''}

Please adapt this template to match the Where to Play context above.`

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      system: getSystemPrompt(platform),
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
