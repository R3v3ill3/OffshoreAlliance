import { NextRequest, NextResponse } from 'next/server'
import {
  anthropic,
  ensureAnthropicConfigured,
  extractJson,
  getAuthedSupabase,
  loadSectionPlanForAi,
  writeAiAudit,
} from '@/lib/section-planning/ai-helpers'
import {
  SECTION_AI_MODEL,
  SEQUENCE_SUGGEST_SYSTEM,
} from '@/lib/prompts/section-planning'

interface Body {
  source_activity_id: number
}

interface SuggestionResponse {
  suggestions?: Array<{
    target_activity_template_key?: string
    target_activity_kind?: string
    trigger?: {
      event_kind?: string
      outcome?: string | null
      threshold_kind?: string
      threshold_value?: number | null
    }
    payload?: Record<string, unknown>
    rationale?: string
  }>
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sectionPlanId: string }> },
) {
  try {
    ensureAnthropicConfigured()
    const { supabase, user } = await getAuthedSupabase()
    const { sectionPlanId: idStr } = await ctx.params
    const sectionPlanId = Number(idStr)
    const body = (await req.json()) as Body
    if (!body.source_activity_id) {
      return NextResponse.json(
        { error: 'missing source_activity_id' },
        { status: 400 },
      )
    }

    const plan = await loadSectionPlanForAi(supabase, sectionPlanId)
    const { data: activity } = await supabase
      .from('campaign_activities')
      .select('*')
      .eq('activity_id', body.source_activity_id)
      .eq('section_plan_id', sectionPlanId)
      .maybeSingle()
    if (!activity) {
      return NextResponse.json({ error: 'activity not found' }, { status: 404 })
    }
    const { data: ambitions } = await supabase
      .from('plan_ambitions')
      .select('*')
      .eq('section_plan_id', sectionPlanId)

    const userMsg = `Suggest 1–3 follow-up activities to chain off this source activity.\n\nContext (JSON):\n\`\`\`json\n${JSON.stringify(
      { plan, source_activity: activity, ambitions },
      null,
      2,
    )}\n\`\`\``

    const result = await anthropic.messages.create({
      model: SECTION_AI_MODEL,
      max_tokens: 1500,
      system: SEQUENCE_SUGGEST_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })
    const text = result.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    const parsed = extractJson<SuggestionResponse>(text) ?? {}

    await writeAiAudit(supabase, {
      section_plan_id: sectionPlanId,
      surface: 'sequence_suggest',
      prompt_snapshot: { source_activity_id: body.source_activity_id },
      response_snapshot: { text, parsed },
      model: SECTION_AI_MODEL,
      created_by: user.id,
    })

    return NextResponse.json({ ...parsed, model: SECTION_AI_MODEL, raw: text })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json(
      { error: (e as Error).message ?? 'unknown error' },
      { status: 500 },
    )
  }
}
