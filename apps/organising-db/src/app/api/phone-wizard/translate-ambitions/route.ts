import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

interface AmbitionInput {
  ambition_id: number
  text: string
  metric_type: string | null
  target_value: string | null
  target_unit: string | null
  category: string | null
}

interface TranslatedOutcome {
  ambition_id: number
  name: string
  description: string
  response_type: 'checkbox' | 'text' | 'select' | 'number'
  response_options: { value: string; label: string }[] | null
  is_positive: boolean
  progress_explanation: string
}

const SYSTEM_PROMPT = `You are a union organising expert who translates campaign-wide ambitions into per-call, per-worker recordable outcomes for phone call campaigns.

Your job: given a campaign ambition (a measurable goal for the whole call list), produce ONE concise outcome that a caller can record for EACH individual worker during a phone call.

RULES:
1. The outcome must be something observable or confirmable in a single phone conversation with one worker
2. Keep outcome names SHORT (under 60 characters) — they appear as form labels during fast-paced calling
3. Choose the right response_type:
   - "checkbox" — binary yes/no (most common). Use for membership, volunteering, attendance, agreement
   - "text" — free text input. Use when the caller needs to record a specific piece of information (worksite name, suggestion, concern)
   - "select" — pick from predefined options. Use for categorical assessments (willingness level, role preference)
   - "number" — numeric input. Use for quantities the worker provides (years experience, team size)
4. For PERCENTAGE ambitions (e.g. "achieve 60% membership density"), the per-call outcome is usually a checkbox ("Worker agrees to join") — each check contributes one worker toward the percentage denominator
5. For COUNT ambitions (e.g. "identify 4 leaders"), the per-call outcome is usually a checkbox ("Worker identified as potential leader") or text ("Leader nomination details")
6. For STRUCTURAL ambitions (e.g. "establish WOCs on 3 worksites"), use text input so callers can record specific information ("Suggested worksite for organising unit")
7. For BOOLEAN ambitions (e.g. "brief all reps on process"), use a checkbox ("Worker confirms understanding of process")
8. System-default membership ambitions (containing "member" or "density") should ALWAYS produce: name="Worker agrees to join/renew membership", response_type="checkbox", is_positive=true
9. is_positive should be true when the outcome represents a favourable result for the organiser
10. progress_explanation should be a SHORT sentence explaining how individual recordings aggregate toward the campaign ambition (e.g. "Each confirmed worker counts toward the 60% density target")

Respond with a JSON array of outcomes, one per ambition:
[
  {
    "ambition_id": number,
    "name": "string (short label for the caller)",
    "description": "string (brief context shown as helper text)",
    "response_type": "checkbox" | "text" | "select" | "number",
    "response_options": [{"value": "string", "label": "string"}] | null,
    "is_positive": boolean,
    "progress_explanation": "string"
  }
]`

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
    const ambitions: AmbitionInput[] = body.ambitions

    if (!ambitions || ambitions.length === 0) {
      return NextResponse.json({ outcomes: [] })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const userMessage = ambitions.map((a, i) => {
      const parts = [`${i + 1}. Ambition #${a.ambition_id}: "${a.text}"`]
      if (a.metric_type) parts.push(`   Metric type: ${a.metric_type}`)
      if (a.target_value) parts.push(`   Target value: ${a.target_value}${a.target_unit ? ` ${a.target_unit}` : ''}`)
      if (a.category) parts.push(`   Category: ${a.category}`)
      return parts.join('\n')
    }).join('\n\n')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Translate these ${ambitions.length} campaign ambitions into per-call recordable outcomes:\n\n${userMessage}` }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    let parsed: TranslatedOutcome[]
    try {
      parsed = JSON.parse(content.text)
    } catch {
      const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        const jsonStart = content.text.indexOf('[')
        const jsonEnd = content.text.lastIndexOf(']')
        if (jsonStart !== -1 && jsonEnd !== -1) {
          parsed = JSON.parse(content.text.slice(jsonStart, jsonEnd + 1))
        } else {
          throw new Error('Could not parse JSON from response')
        }
      }
    }

    // Validate response_type values
    const validTypes = new Set(['checkbox', 'text', 'select', 'number'])
    for (const o of parsed) {
      if (!validTypes.has(o.response_type)) {
        o.response_type = 'checkbox'
      }
    }

    return NextResponse.json({ outcomes: parsed })
  } catch (error) {
    console.error('Translate ambitions error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to translate ambitions' },
      { status: 500 }
    )
  }
}
