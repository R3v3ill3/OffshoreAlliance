import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import {
  SITUATION_ANALYSIS_SUGGEST_SYSTEM_PROMPT,
  buildSituationSuggestUserMessage,
} from '@/lib/prompts/situation-analysis-prompts'
import { loadInternalContext } from '@/lib/situation-analysis/load-internal-context'
import type { SituationAnalysisDraft } from '@/lib/situation-analysis/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Strip any AI-emitted IDs that aren't in the known set. Mirrors the
 * pattern in the employer-wizard/analyse route.
 */
function filterIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  knownEmployerIds: Set<number>
) {
  if (!payload || typeof payload !== 'object') return payload
  // Only the (currently absent) suggested employer-relationship rows
  // would carry employer ids; keep this hook in place for when chat
  // proposes those.
  if (Array.isArray(payload.proposed_employer_relationships)) {
    payload.proposed_employer_relationships =
      payload.proposed_employer_relationships.filter(
        (r: { related_employer_id?: number | null }) =>
          r.related_employer_id == null ||
          knownEmployerIds.has(r.related_employer_id)
      )
  }
  return payload
}

interface SuggestRequestBody {
  campaign_id: number
  draft: SituationAnalysisDraft
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error:
            'Anthropic API key not configured. Please add ANTHROPIC_API_KEY to your environment variables.',
        },
        { status: 500 }
      )
    }

    const body: SuggestRequestBody = await req.json()
    if (!body.campaign_id || !Number.isInteger(body.campaign_id)) {
      return NextResponse.json(
        { error: 'Missing or invalid campaign_id' },
        { status: 400 }
      )
    }
    if (!body.draft) {
      return NextResponse.json({ error: 'Missing draft' }, { status: 400 })
    }

    const { text: internalContext, knownEmployerIds } =
      await loadInternalContext(supabase, body.campaign_id)

    const userMessage = buildSituationSuggestUserMessage({
      internalContext,
      draft: body.draft,
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SITUATION_ANALYSIS_SUGGEST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    let parsed: Record<string, unknown>
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
          return NextResponse.json(
            { error: 'Could not parse JSON from model response' },
            { status: 422 }
          )
        }
      }
    }

    parsed = filterIds(parsed, knownEmployerIds)

    return NextResponse.json({
      ...parsed,
      _ai_meta: {
        model: 'claude-sonnet-4-20250514',
        prompt_version: 1,
      },
    })
  } catch (error) {
    console.error('Situation analysis suggest API error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
