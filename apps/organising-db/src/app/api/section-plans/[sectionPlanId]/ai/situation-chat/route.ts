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
  SITUATION_CHAT_SYSTEM,
} from '@/lib/prompts/section-planning'

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}
interface Body {
  messages: ChatTurn[]
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
    if (!Number.isFinite(sectionPlanId)) {
      return NextResponse.json({ error: 'invalid section plan id' }, { status: 400 })
    }
    const body = (await req.json()) as Body
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'missing messages' }, { status: 400 })
    }

    const plan = await loadSectionPlanForAi(supabase, sectionPlanId)
    const { data: snippet } = await supabase
      .from('section_plan_situation_snippets')
      .select('*')
      .eq('section_plan_id', sectionPlanId)
      .maybeSingle()
    const { data: workforce } = await supabase
      .from('v_section_plan_workforce_mapping')
      .select('*')
      .eq('campaign_id', plan.campaign_id)

    const contextMessage = `Section plan context (JSON):\n\`\`\`json\n${JSON.stringify(
      { plan, snippet, workforce_mapping: workforce ?? [] },
      null,
      2,
    )}\n\`\`\``

    const result = await anthropic.messages.create({
      model: SECTION_AI_MODEL,
      max_tokens: 1500,
      system: SITUATION_CHAT_SYSTEM,
      messages: [
        { role: 'user', content: contextMessage },
        ...body.messages,
      ],
    })

    const text = result.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')

    const proposed = extractJson<{ proposed_snippet_updates?: Record<string, string> }>(text)

    await writeAiAudit(supabase, {
      section_plan_id: sectionPlanId,
      surface: 'situation_chat',
      prompt_snapshot: { messages: body.messages },
      response_snapshot: { text, proposed },
      model: SECTION_AI_MODEL,
      created_by: user.id,
    })

    return NextResponse.json({
      natural_language: text,
      proposed_snippet_updates: proposed?.proposed_snippet_updates ?? null,
      model: SECTION_AI_MODEL,
    })
  } catch (e) {
    if (e instanceof Response) return e
    const msg = (e as Error).message ?? 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
