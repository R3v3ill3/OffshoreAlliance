import { NextRequest, NextResponse } from 'next/server'
import {
  anthropic,
  ensureAnthropicConfigured,
  extractJson,
  getAuditClient,
  getAuthedSupabase,
  loadSectionPlanForAi,
  writeAiAudit,
} from '@/lib/section-planning/ai-helpers'
import {
  SECTION_AI_MODEL,
  STAGE_MAPPING_SYSTEM,
} from '@/lib/prompts/section-planning'

interface Body {
  regenerate?: boolean
}

interface MappingItem {
  subject_kind: 'ambition' | 'activity' | 'wtp' | 'capacity' | 'soc'
  subject_id: number
  stage_number: number
  confidence?: number | null
  rationale?: string | null
}

interface AiResponse {
  mappings?: MappingItem[]
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
    const body = (await req.json().catch(() => ({}))) as Body

    const plan = await loadSectionPlanForAi(supabase, sectionPlanId)
    const [{ data: ambitions }, { data: activities }, { data: wtp }, { data: capacities }, { data: socs }, { data: snippet }] =
      await Promise.all([
        supabase.from('plan_ambitions').select('*').eq('section_plan_id', sectionPlanId),
        supabase.from('campaign_activities').select('*').eq('section_plan_id', sectionPlanId),
        supabase
          .from('plan_where_to_play')
          .select('*, category:wtp_categories(category_name), option:wtp_options(option_text)')
          .eq('section_plan_id', sectionPlanId),
        supabase
          .from('plan_capacities')
          .select('*, option:capacity_options(option_text, category)')
          .eq('section_plan_id', sectionPlanId),
        supabase.from('section_plan_socs').select('*').eq('section_plan_id', sectionPlanId),
        supabase
          .from('section_plan_situation_snippets')
          .select('*')
          .eq('section_plan_id', sectionPlanId)
          .maybeSingle(),
      ])

    const userMsg = `Map every subject below to its most-relevant P2W stages 1–11.\n\nContext (JSON):\n\`\`\`json\n${JSON.stringify(
      { plan, snippet, ambitions, activities, wtp, capacities, socs },
      null,
      2,
    )}\n\`\`\``

    const result = await anthropic.messages.create({
      model: SECTION_AI_MODEL,
      max_tokens: 3000,
      system: STAGE_MAPPING_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })

    const text = result.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    const parsed = extractJson<AiResponse>(text) ?? {}
    const mappings = parsed.mappings ?? []

    const writeClient = getAuditClient() ?? supabase
    if (body.regenerate) {
      // Drop only the un-confirmed rows; keep human-confirmed mappings.
      await writeClient
        .from('section_plan_stage_mappings')
        .delete()
        .eq('section_plan_id', sectionPlanId)
        .eq('human_confirmed', false)
    }

    const inserted: MappingItem[] = []
    for (const m of mappings) {
      if (
        !m.subject_kind ||
        !Number.isInteger(m.subject_id) ||
        !Number.isInteger(m.stage_number)
      ) {
        continue
      }
      const { error } = await writeClient.from('section_plan_stage_mappings').upsert(
        {
          section_plan_id: sectionPlanId,
          subject_kind: m.subject_kind,
          subject_id: m.subject_id,
          stage_number: m.stage_number,
          confidence: m.confidence ?? null,
          rationale: m.rationale ?? null,
          model: SECTION_AI_MODEL,
          prompt_snapshot: { source: 'ai/stage-mapping' },
          human_confirmed: false,
        },
        { onConflict: 'section_plan_id,subject_kind,subject_id,stage_number', ignoreDuplicates: false },
      )
      if (!error) inserted.push(m)
    }

    await writeAiAudit(supabase, {
      section_plan_id: sectionPlanId,
      surface: 'stage_mapping',
      prompt_snapshot: { regenerate: !!body.regenerate },
      response_snapshot: { text, parsed, inserted_count: inserted.length },
      model: SECTION_AI_MODEL,
      created_by: user.id,
    })

    return NextResponse.json({
      mappings: inserted,
      model: SECTION_AI_MODEL,
      raw: text,
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json(
      { error: (e as Error).message ?? 'unknown error' },
      { status: 500 },
    )
  }
}
