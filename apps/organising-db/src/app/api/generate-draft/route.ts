import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { CommsDraftRequest, CommsPlatform } from '@/types/planner-types'
import { buildEmailPrompt, buildSmsPrompt, buildPhoneScriptPrompt } from '@/lib/prompts/draft-prompts'
import { loadSituationContextString } from '@/lib/situation-analysis/serialise'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const PROMPT_BUILDERS: Record<CommsPlatform, (req: CommsDraftRequest) => { system: string; user: string }> = {
  email: buildEmailPrompt,
  sms: buildSmsPrompt,
  phone_script: buildPhoneScriptPrompt,
}

export async function POST(req: NextRequest) {
  try {
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

    const body: CommsDraftRequest = await req.json()

    if (!body.platform || !PROMPT_BUILDERS[body.platform]) {
      return NextResponse.json(
        { error: `Invalid platform. Must be one of: email, sms, phone_script` },
        { status: 400 }
      )
    }

    if (!body.campaign_context?.employer_name) {
      return NextResponse.json(
        { error: 'Missing required campaign context (employer_name)' },
        { status: 400 }
      )
    }
    // Ensure agreement_name always has a value so prompts render cleanly
    if (!body.campaign_context.agreement_name) {
      body.campaign_context.agreement_name = 'Independent Organising'
    }

    // Auto-load the campaign's saved situation analysis as additional
    // context unless the caller has already supplied one. Predicted
    // employer playbook moves become inoculation lines in the draft;
    // top issues become agitation hooks; populations drive audience
    // pacing — the explicit SOC pay-off of the wizard step.
    if (!body.situation_analysis_context && body.campaign_id) {
      const ctx = await loadSituationContextString(supabase, body.campaign_id)
      if (ctx) body.situation_analysis_context = ctx
    }

    const { system, user: userMessage } = PROMPT_BUILDERS[body.platform](body)

    // Phone scripts need significantly more tokens than emails or SMS —
    // the full 8-stage SOC structure with EAR objections and inoculation
    // easily exceeds 2 000 tokens, which truncates the JSON mid-string.
    const MAX_TOKENS_BY_PLATFORM: Record<CommsPlatform, number> = {
      sms: 500,
      email: 2000,
      phone_script: 6000,
    }
    const maxTokens = MAX_TOKENS_BY_PLATFORM[body.platform]

    // #region agent log
    fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6d7ac7'},body:JSON.stringify({sessionId:'6d7ac7',location:'generate-draft/route.ts:PRE_API',message:'About to call Anthropic',data:{platform:body.platform,model:'claude-sonnet-4-20250514',max_tokens:maxTokens,systemPromptLen:system.length,userMessageLen:userMessage.length,hasSituationCtx:!!body.situation_analysis_context,situationCtxLen:body.situation_analysis_context?.length??0},timestamp:Date.now(),hypothesisId:'H1-H2-H3'})}).catch(()=>{});
    // #endregion

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // #region agent log
    fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6d7ac7'},body:JSON.stringify({sessionId:'6d7ac7',location:'generate-draft/route.ts:POST_API',message:'Anthropic response received',data:{stopReason:response.stop_reason,inputTokens:response.usage?.input_tokens,outputTokens:response.usage?.output_tokens,contentLength:content.type==='text'?content.text.length:0,contentPreview:content.type==='text'?content.text.slice(0,200):'',contentTail:content.type==='text'?content.text.slice(-200):''},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(()=>{});
    // #endregion

    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `The ${body.platform} draft exceeded the token limit and was truncated. Please try again with shorter custom instructions or contact support.`
      )
    }

    let parsed
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
          // #region agent log
          fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6d7ac7'},body:JSON.stringify({sessionId:'6d7ac7',location:'generate-draft/route.ts:JSON_FALLBACK',message:'Using jsonStart/jsonEnd fallback extraction',data:{jsonStart,jsonEnd,sliceLen:jsonEnd+1-jsonStart,fullLen:content.text.length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          parsed = JSON.parse(content.text.slice(jsonStart, jsonEnd + 1))
        } else {
          throw new Error('Could not parse JSON from Claude response')
        }
      }
    }

    parsed.platform = body.platform

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Generate Draft API error:', error)

    // #region agent log
    fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6d7ac7'},body:JSON.stringify({sessionId:'6d7ac7',location:'generate-draft/route.ts:CATCH',message:'Route caught error',data:{errorType:error instanceof Error?error.constructor.name:'unknown',errorMessage:error instanceof Error?error.message.slice(0,500):'non-Error thrown'},timestamp:Date.now(),hypothesisId:'H1-H2-H3'})}).catch(()=>{});
    // #endregion

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
