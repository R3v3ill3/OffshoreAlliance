import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { TheoryOfWinningRequest } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are a strategic planning analyst for the Offshore Alliance, a joint union initiative (AWU + MUA) operating in Western Australia's offshore oil and gas sector. You are helping organisers develop their "Theory of Winning" — a causal logic chain that connects their strategic choices to their campaign ambitions.

CONTEXT:
The Offshore Alliance uses a highly structured, high-intensity organising model focused on:
- Structured contact networks with monitorable 2-way communication
- Member-driven, shared-responsibility approach
- Stage-and-gate progression model for enterprise bargaining campaigns
- Rapid mobilisation to action capability

TASK:
Given the organiser's Ambitions (what they want to achieve) and Where to Play choices (where they'll focus effort), generate:

1. AN IF/THEN STATEMENT: A clear causal logic chain connecting the Where to Play choices to the Ambitions. Format: "If we [specific actions derived from Where to Play choices], then [specific outcomes linked to Ambitions], because [causal reasoning]."

2. GAP ANALYSIS: Identify any gaps where:
   - Ambitions exist without corresponding Where to Play choices to support them
   - Where to Play choices don't connect to any stated Ambition
   - Critical elements of the OA model are missing (e.g., no structured contact network, no narrative/tone selection, no face-to-face element, no member-to-member communication)
   - Contact targets exceed the identified contact pool
   - No communication platform is selected for a communication-dependent ambition
   - No member leadership development element when mobilisation is an ambition

3. RISK ASSESSMENT: Identify risks including:
   - Employer opposition scenarios relevant to this stage
   - Timeline risks (especially if working backwards from agreement expiry)
   - Dependency risks (single points of failure)
   - Over-reliance on organiser-driven vs member-driven activity
   - The 9-month intractable bargaining trap (for Stage 6)

4. MEMBER AGENCY CHECK: Assess whether the plan builds member ownership and shared responsibility, or whether it risks being too organiser-dependent.

Respond in JSON format:
{
  "if_then_statement": "string",
  "gap_analysis": [
    {
      "gap_type": "missing_wtp" | "unsupported_ambition" | "model_gap" | "capacity_gap",
      "description": "string",
      "severity": "high" | "medium" | "low",
      "recommendation": "string"
    }
  ],
  "risk_assessment": [
    {
      "risk": "string",
      "likelihood": "high" | "medium" | "low",
      "impact": "high" | "medium" | "low",
      "mitigation": "string"
    }
  ],
  "member_agency_assessment": "string",
  "employer_response_considerations": "string"
}`

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
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

    const body: TheoryOfWinningRequest = await req.json()

    // Build the user message
    const userMessage = `
Campaign: ${body.campaign_context.agreement_name}
Employer: ${body.campaign_context.employer_name}
Sector: ${body.campaign_context.sector}
Worksites: ${body.campaign_context.worksite_names.join(', ') || 'Not specified'}
Stage: ${body.stage_number} — ${body.stage_name}
${body.campaign_context.agreement_expiry ? `Agreement Expiry: ${body.campaign_context.agreement_expiry}` : ''}
${body.campaign_context.days_to_pabo ? `Days until PABO available: ${body.campaign_context.days_to_pabo}` : ''}
${body.campaign_context.is_greenfield ? 'This is a greenfield/first bargaining campaign.' : ''}

AMBITIONS (What we want to achieve):
${body.ambitions.map((a, i) => `${i + 1}. [${a.category}] ${a.text}${a.target_value ? ` (Target: ${a.target_value}${a.target_unit ? ' ' + a.target_unit : ''})` : ''}`).join('\n')}

WHERE TO PLAY (Where we'll focus effort):
${body.where_to_play.map((w) => `- [${w.category}] ${w.is_exclusion ? 'NOT playing: ' : ''}${w.option_text} (Priority: ${w.priority === 1 ? 'High' : w.priority === 2 ? 'Medium' : 'Low'})${w.rationale ? ` — Rationale: ${w.rationale}` : ''}`).join('\n')}

CAPACITIES (Resources we have/need):
${body.capacities.length > 0 ? body.capacities.map((c) => `- [${c.category}] ${c.option_text}: ${c.status}`).join('\n') : 'Not yet assessed'}

${body.previous_stage_theory ? `PREVIOUS STAGE THEORY:\n${body.previous_stage_theory}\n\nPlease ensure continuity and logical progression from the previous stage's theory.` : ''}

Please generate the Theory of Winning for this stage.`

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // Extract JSON from response
    let parsed
    try {
      // Try to parse directly
      parsed = JSON.parse(content.text)
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        // Try to find JSON object in the text
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
    console.error('Theory of Winning API error:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
