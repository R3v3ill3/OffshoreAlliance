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
  TOW_CHECK_SYSTEM,
} from '@/lib/prompts/section-planning'

interface Body {
  if_then_statement: string
}

interface TowCheckResponse {
  gap_analysis?: {
    capability_gaps?: string[]
    member_agency_concerns?: string[]
    employer_response_risks?: string[]
  }
  contradictions?: string[]
  confidence?: number
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
    if (!body.if_then_statement?.trim()) {
      return NextResponse.json({ error: 'missing if_then_statement' }, { status: 400 })
    }

    const plan = await loadSectionPlanForAi(supabase, sectionPlanId)
    const [{ data: snippet }, { data: ambitions }, { data: wtp }, { data: capacities }] =
      await Promise.all([
        supabase
          .from('section_plan_situation_snippets')
          .select('*')
          .eq('section_plan_id', sectionPlanId)
          .maybeSingle(),
        supabase
          .from('plan_ambitions')
          .select('*')
          .eq('section_plan_id', sectionPlanId),
        supabase
          .from('plan_where_to_play')
          .select('*, category:wtp_categories(category_name), option:wtp_options(option_text)')
          .eq('section_plan_id', sectionPlanId),
        supabase
          .from('plan_capacities')
          .select('*, option:capacity_options(option_text, category)')
          .eq('section_plan_id', sectionPlanId),
      ])

    const userMsg = `Stress-test this if/then statement:\n"${body.if_then_statement}"\n\nContext (JSON):\n\`\`\`json\n${JSON.stringify(
      { plan, snippet, ambitions, wtp, capacities },
      null,
      2,
    )}\n\`\`\``

    const result = await anthropic.messages.create({
      model: SECTION_AI_MODEL,
      max_tokens: 1500,
      system: TOW_CHECK_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })
    const text = result.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    const parsed = extractJson<TowCheckResponse>(text) ?? {}

    await writeAiAudit(supabase, {
      section_plan_id: sectionPlanId,
      surface: 'tow_check',
      prompt_snapshot: { if_then_statement: body.if_then_statement },
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
