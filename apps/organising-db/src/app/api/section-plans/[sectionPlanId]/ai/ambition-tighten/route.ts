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
  AMBITION_TIGHTEN_SYSTEM,
  SECTION_AI_MODEL,
} from '@/lib/prompts/section-planning'

interface Body {
  ambition_id: number
}

interface TightenResponse {
  tightened_text?: string
  suggested_target_value?: string | null
  suggested_target_unit?: string | null
  suggested_target_date?: string | null
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
    if (!body.ambition_id) {
      return NextResponse.json({ error: 'missing ambition_id' }, { status: 400 })
    }

    const plan = await loadSectionPlanForAi(supabase, sectionPlanId)
    const { data: ambition, error: ambErr } = await supabase
      .from('plan_ambitions')
      .select('*')
      .eq('ambition_id', body.ambition_id)
      .eq('section_plan_id', sectionPlanId)
      .maybeSingle()
    if (ambErr) throw ambErr
    if (!ambition) {
      return NextResponse.json({ error: 'ambition not found' }, { status: 404 })
    }
    const { data: snippet } = await supabase
      .from('section_plan_situation_snippets')
      .select('*')
      .eq('section_plan_id', sectionPlanId)
      .maybeSingle()

    const userMsg = `Tighten this ambition. Stay within the section's date window (${plan.start_date} → ${plan.end_date}).\n\nContext (JSON):\n\`\`\`json\n${JSON.stringify(
      { plan, snippet, ambition },
      null,
      2,
    )}\n\`\`\``

    const result = await anthropic.messages.create({
      model: SECTION_AI_MODEL,
      max_tokens: 600,
      system: AMBITION_TIGHTEN_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })

    const text = result.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    const parsed = extractJson<TightenResponse>(text) ?? {}

    await writeAiAudit(supabase, {
      section_plan_id: sectionPlanId,
      surface: 'ambition_tighten',
      prompt_snapshot: { ambition_id: body.ambition_id },
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
