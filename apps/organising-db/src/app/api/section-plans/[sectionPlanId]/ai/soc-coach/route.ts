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
  SOC_COACH_VARIANTS,
} from '@/lib/prompts/section-planning'

const STEP_FIELDS = [
  'step_1_introduction',
  'step_2_agitation_or_briefing',
  'step_3_hope_or_walkthrough',
  'step_4_call_to_action_or_hope',
  'step_5_mapping_or_clear_ask',
  'step_6_industrial_or_pabo',
  'step_7_inoculation_or_close',
] as const
type StepField = (typeof STEP_FIELDS)[number]

interface Body {
  soc_id: number
  step_field: StepField
  current_text?: string | null
}

interface SocCoachResponse {
  proposed_step_text?: string
  rationale?: string
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
    if (!body.soc_id || !STEP_FIELDS.includes(body.step_field)) {
      return NextResponse.json({ error: 'missing soc_id or step_field' }, { status: 400 })
    }

    const plan = await loadSectionPlanForAi(supabase, sectionPlanId)
    const { data: soc } = await supabase
      .from('section_plan_socs')
      .select('*')
      .eq('soc_id', body.soc_id)
      .eq('section_plan_id', sectionPlanId)
      .maybeSingle()
    if (!soc) return NextResponse.json({ error: 'soc not found' }, { status: 404 })
    const { data: snippet } = await supabase
      .from('section_plan_situation_snippets')
      .select('*')
      .eq('section_plan_id', sectionPlanId)
      .maybeSingle()
    const { data: ambitions } = await supabase
      .from('plan_ambitions')
      .select('*')
      .eq('section_plan_id', sectionPlanId)

    const variant = SOC_COACH_VARIANTS[soc.soc_kind as 'members_general' | 'bargaining_reps']

    const userMsg = `Draft step "${body.step_field}" for this SOC. Current text (may be empty):\n${
      body.current_text ?? soc[body.step_field] ?? '(empty)'
    }\n\nContext (JSON):\n\`\`\`json\n${JSON.stringify(
      { plan, snippet, ambitions, soc },
      null,
      2,
    )}\n\`\`\``

    const result = await anthropic.messages.create({
      model: SECTION_AI_MODEL,
      max_tokens: 800,
      system: variant,
      messages: [{ role: 'user', content: userMsg }],
    })
    const text = result.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    const parsed = extractJson<SocCoachResponse>(text) ?? {}

    await writeAiAudit(supabase, {
      section_plan_id: sectionPlanId,
      surface: 'soc_coach',
      prompt_snapshot: {
        soc_id: body.soc_id,
        step_field: body.step_field,
      },
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
