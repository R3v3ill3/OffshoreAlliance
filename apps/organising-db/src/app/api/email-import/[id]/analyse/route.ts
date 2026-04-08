import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const STAGE_NAMES: Record<number, string> = {
  1: 'Contact ID & Mapping',
  2: 'Intro Comms & Education',
  3: 'Member Mobilisation',
  4: 'Develop Claims / MSD',
  5: 'Endorsement & Commence Bargaining',
  6: 'Bargaining to Win',
}

const SYSTEM_PROMPT = `You are analysing a forwarded email for the Offshore Alliance, a joint AWU/MUA union initiative in Australia's offshore oil and gas sector. Your job is to extract campaign planning context from this email so it can be used as a communications template.

The Offshore Alliance campaigns follow a 6-stage model:
1. Contact ID & Mapping
2. Intro Comms & Education
3. Member Mobilisation
4. Develop Claims / MSD (Member Services Delivery)
5. Endorsement & Commence Bargaining
6. Bargaining to Win

Analyse the email and return a JSON object with ALL of the following fields:

- "stage_number": number 1-6 or null. Which campaign stage this email is most suited for.
- "stage_rationale": string. Brief explanation of why this stage was chosen.
- "tone_tags": array of strings from EXACTLY these values: "informative", "urgency", "shared_responsibility", "success_story", "solidarity", "fairness", "worker_voice", "job_security". Select all that apply.
- "audience_segment": one string from EXACTLY these values: "existing_members", "lapsed_members", "non_members_known", "non_members_unknown", "all_workers", "bargaining_reps", "hsrs", "delegates", "marine_workers", "catering_workers". Pick the best fit.
- "activity_type": one string from EXACTLY these values: "first_contact", "education", "mobilisation", "bargaining_update", "action_alert", "survey", "meeting_invite", "membership_check", "general_update". Pick the best fit.
- "suggested_title": string. A short title for this template (e.g. "Bargaining Update - Wage Offer").
- "variables": array of variable names that could be parameterised (e.g. names, dates, employers, worksites). Use snake_case format without braces.
- "platform": "email" (confirm or override based on content).
- "design_elements": object with:
  - "has_images": boolean
  - "has_custom_fonts": boolean
  - "font_families": array of detected font family names
  - "primary_colors": array of hex colour codes detected in the HTML
  - "layout_type": one of "single_column", "two_column", "newsletter", "simple_text"
- "target_audience_description": string. Plain-language description of who this email targets.
- "call_to_action": string or null. What the email asks the reader to do.
- "key_themes": array of strings. 2-5 key themes or topics in the email.
- "suggested_wtp_categories": array of objects, each with "category" (string) and "option" (string), mapping to Where to Play planning dimensions. Categories include: "Narrative & Tone", "Potential Contacts", "Communication Platforms", "Engagement Intensity", "Mobilisation Tactics".

Respond with ONLY valid JSON, no markdown formatting or explanation.`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params
    const importId = parseInt(id)
    if (isNaN(importId)) {
      return NextResponse.json({ error: 'Invalid import ID' }, { status: 400 })
    }

    const { data: emailImport, error: fetchError } = await supabase
      .from('email_imports')
      .select('*')
      .eq('import_id', importId)
      .single()

    if (fetchError || !emailImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    const content = emailImport.body_html || emailImport.body_text || ''
    if (!content.trim()) {
      return NextResponse.json({ error: 'No email content to analyse' }, { status: 400 })
    }

    const userMessage = `Email subject: ${emailImport.subject}
${emailImport.subject_tag ? `Subject tag (use case indicator): ${emailImport.subject_tag}` : ''}
From: ${emailImport.from_address || 'Unknown'}

Email content (${emailImport.body_html ? 'HTML' : 'plain text'}):
---
${content.slice(0, 12000)}
---

Stage names for reference:
${Object.entries(STAGE_NAMES).map(([n, name]) => `${n}. ${name}`).join('\n')}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
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

    const { error: updateError } = await supabase
      .from('email_imports')
      .update({
        ai_analysis: parsed,
        analysis_status: 'analysed',
      })
      .eq('import_id', importId)

    if (updateError) {
      console.error('Failed to update email import with analysis:', updateError)
    }

    return NextResponse.json({ analysis: parsed, import_id: importId })
  } catch (error) {
    console.error('Email import analysis error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
