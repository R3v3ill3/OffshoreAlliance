/**
 * POST /api/soc-wizard/derive-artifact
 *
 * Hand-off endpoint. Turns SOC content (whole-session or single-stage)
 * into one of:
 *   - email / sms / phone_script — runs the existing comms prompt
 *     builders against the SOC content as `template_examples`, INSERTs
 *     into campaign_comms_drafts, and links it via soc_derived_artifacts.
 *   - snippet — copies the locked stage content into
 *     soc_derived_artifacts.inline_body for the user to paste manually.
 *
 * Body: {
 *   session_id: number,
 *   artifact_kind: 'email'|'sms'|'phone_script'|'snippet',
 *   stage_number?: 1..8,                                  // omit to use whole session
 *   hope_frame?: 'opportunity'|'plan'|'dont_take_lolly',  // optional, only relevant for stage 5
 *   campaign_id?: number,                                 // required for non-snippet kinds when session has no campaign_id
 *   tone?: string,
 *   audience?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildEmailPrompt, buildSmsPrompt, buildPhoneScriptPrompt } from '@/lib/prompts/draft-prompts'
import type { CommsDraftRequest, CommsPlatform } from '@/types/planner-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT_BUILDERS: Record<CommsPlatform, (r: CommsDraftRequest) => { system: string; user: string }> = {
  email: buildEmailPrompt,
  sms: buildSmsPrompt,
  phone_script: buildPhoneScriptPrompt,
}

const COMMS_KINDS = ['email', 'sms', 'phone_script'] as const
type CommsKind = typeof COMMS_KINDS[number]

function isCommsKind(k: string): k is CommsKind {
  return (COMMS_KINDS as readonly string[]).includes(k)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      session_id,
      artifact_kind,
      stage_number,
      hope_frame,
      campaign_id: bodyCampaignId,
      tone,
      audience,
    } = body as {
      session_id: number
      artifact_kind: 'email' | 'sms' | 'phone_script' | 'snippet'
      stage_number?: number
      hope_frame?: 'opportunity' | 'plan' | 'dont_take_lolly'
      campaign_id?: number
      tone?: string
      audience?: string
    }

    if (!Number.isInteger(session_id)) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }
    if (!['email', 'sms', 'phone_script', 'snippet'].includes(artifact_kind)) {
      return NextResponse.json({ error: 'invalid artifact_kind' }, { status: 400 })
    }

    // Load session + stage content (RLS enforces visibility)
    const { data: session, error: sessionErr } = await supabase
      .from('soc_sessions')
      .select('session_id, campaign_id, stage_number, title, target_populations, context_snapshot')
      .eq('session_id', session_id)
      .maybeSingle()
    if (sessionErr) throw sessionErr
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const campaignId = bodyCampaignId ?? session.campaign_id ?? null

    // Fetch the stage content rows we want to fold into the artifact
    let contentQuery = supabase
      .from('soc_stage_content')
      .select('stage_number, stage_name, hope_frame, locked_content')
      .eq('session_id', session_id)
      .order('stage_number', { ascending: true })
    if (stage_number) contentQuery = contentQuery.eq('stage_number', stage_number)
    if (hope_frame) contentQuery = contentQuery.eq('hope_frame', hope_frame)
    const { data: stageContents, error: contentErr } = await contentQuery
    if (contentErr) throw contentErr
    if (!stageContents || stageContents.length === 0) {
      return NextResponse.json(
        { error: 'No locked content available to export — lock at least one stage first' },
        { status: 400 }
      )
    }

    // Snippet: copy inline, no AI
    if (artifact_kind === 'snippet') {
      const inlineBody = stageContents
        .map((c) => `### ${c.stage_name}${c.hope_frame ? ` (${c.hope_frame})` : ''}\n\n${c.locked_content}`)
        .join('\n\n')

      const { data: artifact, error: artifactErr } = await supabase
        .from('soc_derived_artifacts')
        .insert({
          session_id,
          stage_number: stage_number ?? null,
          hope_frame: hope_frame ?? null,
          artifact_kind: 'snippet',
          inline_body: inlineBody,
          created_by: user.id,
        })
        .select()
        .single()
      if (artifactErr) throw artifactErr

      return NextResponse.json({ artifact, body: inlineBody })
    }

    // Comms kinds: run prompt builder + create draft
    if (!isCommsKind(artifact_kind)) {
      return NextResponse.json({ error: 'invalid artifact_kind' }, { status: 400 })
    }
    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaign_id is required to derive an email/sms/phone draft' },
        { status: 400 }
      )
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (session.context_snapshot || {}) as any
    const draftReq: CommsDraftRequest = {
      campaign_id: campaignId,
      plan_id: ctx.stage?.plan_id ?? 0,
      stage_number: ctx.stage?.stage_number ?? session.stage_number ?? 1,
      stage_name: ctx.stage?.stage_name ?? '',
      platform: artifact_kind,
      campaign_context: {
        agreement_name: ctx.agreement?.agreement_name ?? 'Independent Organising',
        employer_name: ctx.campaign?.name ?? 'Unknown Employer',
        sector: 'Offshore Oil & Gas',
        worksite_names: [],
        campaign_type: ctx.campaign?.campaign_type ?? undefined,
        agreement_expiry: ctx.agreement?.expiry_date ?? undefined,
        organiser_name: ctx.organiser?.organiser_name ?? undefined,
        organiser_phone: ctx.organiser?.phone ?? undefined,
      },
      wtp_selections: {
        tone: tone ? [tone] : [],
        audience: audience ? [audience] : [],
        platforms: [artifact_kind],
      },
      template_examples: stageContents.map((c) => ({
        title: `${c.stage_name}${c.hope_frame ? ` (${c.hope_frame})` : ''}`,
        body_text: c.locked_content,
      })),
      custom_instructions: `This draft is being derived from a Structured Organising Conversation. Use the stage content above as the SOURCE OF TRUTH for tone, language, and persuasive content; adapt the form to suit a ${artifact_kind === 'email' ? 'campaign email' : artifact_kind === 'sms' ? 'short SMS' : 'phone script'}. Preserve the SOC's voice and the populations it was written for.`,
    }

    const { system, user: userMessage } = PROMPT_BUILDERS[artifact_kind](draftReq)

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = completion.content[0]
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Unexpected response from Claude')
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(textBlock.text)
    } catch {
      const start = textBlock.text.indexOf('{')
      const end = textBlock.text.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('Could not parse JSON from Claude response')
      parsed = JSON.parse(textBlock.text.slice(start, end + 1))
    }

    // Insert into campaign_comms_drafts
    const { data: draft, error: draftErr } = await supabase
      .from('campaign_comms_drafts')
      .insert({
        campaign_id: campaignId,
        stage_number: draftReq.stage_number,
        platform: artifact_kind,
        title: `${session.title} → ${artifact_kind}`,
        subject: (parsed.subject as string) ?? null,
        body: (parsed.body_text as string) ?? '',
        body_html: (parsed.body_html as string) ?? null,
        tone: (parsed.tone_applied as string) ?? tone ?? null,
        audience_segment: (parsed.audience_targeted as string) ?? audience ?? null,
        status: 'draft',
        ai_model_used: 'claude-sonnet-4-20250514',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        variables_used: (parsed.variables_used as any) ?? null,
        custom_instructions: draftReq.custom_instructions,
        created_by: user.id,
      })
      .select()
      .single()
    if (draftErr) throw draftErr

    // Link via soc_derived_artifacts
    const { data: artifact, error: artifactErr } = await supabase
      .from('soc_derived_artifacts')
      .insert({
        session_id,
        stage_number: stage_number ?? null,
        hope_frame: hope_frame ?? null,
        artifact_kind,
        draft_id: draft.draft_id,
        created_by: user.id,
      })
      .select()
      .single()
    if (artifactErr) throw artifactErr

    return NextResponse.json({ artifact, draft })
  } catch (error) {
    console.error('SOC derive-artifact error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
