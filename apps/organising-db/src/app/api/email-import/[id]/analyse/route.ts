import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

/** Align with client `API_FETCH_TIMEOUT_LLM_MS` so Vercel does not exit first. */
export const maxDuration = 120

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

const SYSTEM_PROMPT = `You are analysing a forwarded email for the Offshore Alliance, a joint AWU/MUA union initiative in Australia's offshore oil and gas sector. Your job is to extract campaign planning context from this email so it can be used as a reusable communications template.

The Offshore Alliance campaigns follow a 6-stage model:
1. Contact ID & Mapping
2. Intro Comms & Education
3. Member Mobilisation
4. Develop Claims / MSD (Member Services Delivery)
5. Endorsement & Commence Bargaining
6. Bargaining to Win

KNOWN TEMPLATE VARIABLES (you MUST only use these):
Campaign context (resolved when creating a draft from the template):
  employer_name, agreement_name, worksite_name, campaign_name, organiser_name, organiser_phone, staff_name, staff_email, staff_phone, staff_role, date
Recipient (resolved at send time by Action Network):
  first_name, last_name

Analyse the email and return a JSON object with ALL of the following fields:

- "stage_number": number 1-6 or null.
- "stage_rationale": string. Brief explanation.
- "tone_tags": array from EXACTLY: "informative", "urgency", "shared_responsibility", "success_story", "solidarity", "fairness", "worker_voice", "job_security".
- "audience_segment": one from EXACTLY: "existing_members", "lapsed_members", "non_members_known", "non_members_unknown", "all_workers", "bargaining_reps", "hsrs", "delegates", "marine_workers", "catering_workers".
- "activity_type": one from EXACTLY: "first_contact", "education", "mobilisation", "bargaining_update", "action_alert", "survey", "meeting_invite", "membership_check", "general_update".
- "suggested_title": string.
- "platform": "email".
- "design_elements": { "has_images": boolean, "has_custom_fonts": boolean, "font_families": string[], "primary_colors": string[], "layout_type": "single_column" | "two_column" | "newsletter" | "simple_text" }
- "target_audience_description": string.
- "call_to_action": string or null.
- "key_themes": string[] (2-5 items).
- "suggested_wtp_categories": array of { "category": string, "option": string }.

- "variable_replacements": array of objects identifying specific text in the email that should be replaced with template variables. Each object:
  - "original_text": string. The EXACT text from the email to replace (e.g. "Woodside Energy", "Dear John").
  - "variable": string. One of the known variable names listed above (e.g. "employer_name", "first_name"). MUST be from the known list.
  - "confidence": "high" | "medium". How confident you are this text should be parameterised.
  - "context": string. Brief explanation (max 60 chars) of why this replacement makes sense.

IMPORTANT for variable_replacements:
- Scan the email for employer names, company names, agreement/EBA names, worksite/platform names, organiser names, recipient greetings, dates, phone numbers, and email addresses.
- Match each piece of text to the MOST APPROPRIATE known variable.
- Include the EXACT text as it appears in the email (case-sensitive, including surrounding context if needed for unique matching).
- Do NOT invent variable names outside the known list.
- If text looks parameterisable but no known variable fits, omit it.

Respond with ONLY valid JSON, no markdown formatting.`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t0 = Date.now()
  const requestId = req.headers.get('x-request-id') ?? 'none'
  const log = (
    stage: string,
    importId: number | null = null,
    extra?: Record<string, unknown>,
  ) => {
    console.log(
      JSON.stringify({
        route: 'email-import/analyse',
        requestId,
        stage,
        importId,
        ms: Date.now() - t0,
        ...extra,
      }),
    )
  }

  try {
    log('start', null)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    log('auth_ok', null)

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

    log('db_ok', importId)

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

    log('anthropic_start', importId)
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    log('anthropic_end', importId)
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

    log('done', importId)
    return NextResponse.json({ analysis: parsed, import_id: importId })
  } catch (error) {
    log('error', null, { message: error instanceof Error ? error.message : String(error) })
    console.error('Email import analysis error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
