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
  side_effect: 'none' | 'set_membership_pending'
  side_effect_payload?: Record<string, unknown> | null
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
8. Membership / density ambitions (containing "member" or "density", or category membership_growth): produce ONE outcome with name="Worker agrees to join the union", response_type="checkbox", is_positive=true, side_effect="set_membership_pending". This applies to workers who are not yet member-like; the system will set them to member_pending (not financial member) when positively recorded on a campaign list.
9. is_positive should be true when the outcome represents a favourable result for the organiser
10. progress_explanation should be a SHORT sentence explaining how individual recordings aggregate toward the campaign ambition (e.g. "Each confirmed worker counts toward the 60% density target")
11. side_effect: use "none" unless recording this outcome should set the worker to member_pending when positively completed on a campaign call (rule 8). For select response_type with membership side effect, include option values "joined" and "yes" in response_options.

Respond with a JSON array of outcomes, one per ambition:
[
  {
    "ambition_id": number,
    "name": "string (short label for the caller)",
    "description": "string (brief context shown as helper text)",
    "response_type": "checkbox" | "text" | "select" | "number",
    "response_options": [{"value": "string", "label": "string"}] | null,
    "is_positive": boolean,
    "progress_explanation": "string",
    "side_effect": "none" | "set_membership_pending"
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

    const validTypes = new Set(['checkbox', 'text', 'select', 'number'])
    const validSide = new Set(['none', 'set_membership_pending'])
    for (const o of parsed) {
      if (!validTypes.has(o.response_type)) {
        o.response_type = 'checkbox'
      }
      const rawSide = o.side_effect as string
      if (rawSide === 'set_membership_financial') {
        o.side_effect = 'set_membership_pending'
      }
      if (!o.side_effect || !validSide.has(o.side_effect)) {
        o.side_effect = 'none'
      }
    }

    const expanded: TranslatedOutcome[] = []
    for (const o of parsed) {
      expanded.push(o)
      if (o.side_effect === 'set_membership_pending') {
        expanded.push({
          ambition_id: o.ambition_id,
          name: 'Worker will ask others to join the union',
          description:
            'For workers who are already members (financial, pending, or other union). Records that they will recruit colleagues. No automatic membership change.',
          response_type: 'checkbox',
          response_options: null,
          is_positive: true,
          progress_explanation: o.progress_explanation,
          side_effect: 'none',
          side_effect_payload: { phone_ask: 'recruit_others' },
        })
      }
    }

    return NextResponse.json({ outcomes: expanded })
  } catch (error) {
    console.error('Translate ambitions error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to translate ambitions' },
      { status: 500 }
    )
  }
}
