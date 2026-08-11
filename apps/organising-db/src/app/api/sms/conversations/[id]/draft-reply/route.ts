/**
 * POST /api/sms/conversations/[id]/draft-reply — AI reply drafting
 * for the inbox composer (Phase 7, brief §8.2).
 *
 * Same Anthropic-SDK-in-route pattern as /api/generate-draft (model
 * from lib/ai/models, prompt builder in lib/prompts, fence-tolerant
 * JSON parse). Context is assembled SERVER-side — the client sends
 * nothing but the conversation id:
 *   - last 20 messages of the thread,
 *   - worker profile (name / employer / occupation),
 *   - recent campaign_activity_ratings for the attached campaign,
 *   - the attached activity (title + CTA fields),
 *   - active canned replies (campaign + org-wide) as tone reference.
 *
 * Guardrails (§8.2): 403 when the member has opted out (a draft for an
 * unsendable thread is a footgun); campaign write gate on campaign-
 * scoped threads (mirrors POST …/messages); candidates are parsed,
 * phone-number-sanitised and NEVER auto-sent — the UI loads the chosen
 * candidate into the composer for editing, and the send route stamps
 * sms_messages.ai_assisted.
 *
 * Degrades with a clear 503 when ANTHROPIC_API_KEY is unset.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { AI_MODEL } from '@/lib/ai/models'
import { countSegments } from '@/lib/sms/segments'
import {
  buildSmsReplyPrompt,
  parseDraftReplyCandidates,
  type SmsReplyPromptContext,
} from '@/lib/prompts/sms-reply-prompts'

const TRANSCRIPT_LIMIT = 20
const RATINGS_LIMIT = 5
const CANNED_LIMIT = 8

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const conversationId = parseInt(id, 10)
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error:
            'AI drafting is not configured on this deployment (ANTHROPIC_API_KEY is missing) — write the reply manually.',
        },
        { status: 503 },
      )
    }

    const { data: conversation, error: convErr } = await supabase
      .from('sms_conversations')
      .select('conversation_id, worker_id, campaign_id, activity_id')
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (convErr) throw convErr
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Campaign-scoped threads require campaign write access (mirrors
    // POST …/messages); org-wide triage threads only need auth.
    if (conversation.campaign_id != null) {
      const { data: canWrite, error: permErr } = await supabase.rpc(
        'can_write_to_campaign',
        { p_campaign_id: conversation.campaign_id },
      )
      if (permErr) throw permErr
      if (!canWrite) {
        return NextResponse.json(
          { error: 'No write access to this campaign' },
          { status: 403 },
        )
      }
    }

    // ── Context assembly ─────────────────────────────────────────
    let worker: SmsReplyPromptContext['worker'] = null
    if (conversation.worker_id != null) {
      const { data: w, error: wErr } = await supabase
        .from('workers')
        .select(
          'worker_id, first_name, last_name, preferred_name, occupation, sms_opt_out, employers(employer_name)',
        )
        .eq('worker_id', conversation.worker_id)
        .maybeSingle()
      if (wErr) throw wErr
      if (w) {
        // §8.2: drafts must respect the member's opt-out state.
        if (w.sms_opt_out) {
          return NextResponse.json(
            {
              error:
                'This member has opted out of SMS — no replies (drafted or otherwise) can be sent.',
            },
            { status: 403 },
          )
        }
        const employerRel = w.employers as
          | { employer_name?: string }
          | { employer_name?: string }[]
          | null
        const employer = Array.isArray(employerRel) ? employerRel[0] : employerRel
        worker = {
          name:
            `${w.preferred_name || w.first_name || ''} ${w.last_name || ''}`.trim() ||
            'the member',
          occupation: w.occupation ?? null,
          employer: employer?.employer_name ?? null,
        }
      }
    }

    const { data: messages, error: msgErr } = await supabase
      .from('sms_messages')
      .select('direction, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('message_id', { ascending: false })
      .limit(TRANSCRIPT_LIMIT)
    if (msgErr) throw msgErr
    const transcript = ((messages ?? []) as Array<{
      direction: 'inbound' | 'outbound'
      body: string | null
      created_at: string
    }>)
      .reverse()
      .filter((m) => m.body?.trim())
      .map((m) => ({
        direction: m.direction,
        body: (m.body as string).trim(),
        at: m.created_at,
      }))
    if (transcript.length === 0) {
      return NextResponse.json(
        { error: 'Nothing to draft from — this thread has no messages yet.' },
        { status: 409 },
      )
    }

    let campaignName: string | null = null
    let ratings: SmsReplyPromptContext['ratings'] = []
    let activity: SmsReplyPromptContext['activity'] = null
    if (conversation.campaign_id != null) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('name')
        .eq('campaign_id', conversation.campaign_id)
        .maybeSingle()
      campaignName = campaign?.name ?? null

      if (conversation.worker_id != null) {
        const { data: ratingRows } = await supabase
          .from('campaign_activity_ratings')
          .select(
            'rating, binary_value, notes, rated_at, campaign_activities!inner(title, campaign_id)',
          )
          .eq('worker_id', conversation.worker_id)
          .eq('campaign_activities.campaign_id', conversation.campaign_id)
          .order('rated_at', { ascending: false })
          .limit(RATINGS_LIMIT)
        ratings = ((ratingRows ?? []) as Array<{
          rating: number | null
          binary_value: string | null
          notes: string | null
          rated_at: string
          campaign_activities:
            | { title?: string }
            | { title?: string }[]
            | null
        }>).map((r) => {
          const rel = Array.isArray(r.campaign_activities)
            ? r.campaign_activities[0]
            : r.campaign_activities
          return {
            activity: rel?.title ?? 'Activity',
            rating: r.rating,
            binaryValue: r.binary_value,
            notes: r.notes,
            ratedAt: r.rated_at,
          }
        })
      }

      if (conversation.activity_id != null) {
        const { data: act } = await supabase
          .from('campaign_activities')
          .select('title, description, is_binary, supporter_outcome_value')
          .eq('activity_id', conversation.activity_id)
          .maybeSingle()
        if (act) {
          activity = {
            title: act.title,
            description: act.description ?? null,
            isBinary: !!act.is_binary,
            supporterOutcomeValue: act.supporter_outcome_value ?? null,
          }
        }
      }
    }

    let cannedQuery = supabase
      .from('sms_canned_replies')
      .select('title, body, campaign_id')
      .eq('is_active', true)
      .limit(CANNED_LIMIT)
    cannedQuery =
      conversation.campaign_id != null
        ? cannedQuery.or(`campaign_id.eq.${conversation.campaign_id},campaign_id.is.null`)
        : cannedQuery.is('campaign_id', null)
    const { data: canned } = await cannedQuery
    const cannedReplies = ((canned ?? []) as Array<{ title: string; body: string }>).map(
      (c) => ({ title: c.title, body: c.body }),
    )

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle()

    const { system, user: userMessage } = buildSmsReplyPrompt({
      transcript,
      worker,
      ratings,
      campaignName,
      activity,
      cannedReplies,
      organiserName: profile?.display_name ?? null,
    })

    // ── Model call (pattern of /api/generate-draft) ──────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: userMessage }],
    })
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    const candidates = parseDraftReplyCandidates(content.text)
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: 'The AI did not return a usable draft — try again.' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      candidates: candidates.map((c) => ({
        ...c,
        segments: countSegments(c.body).segments,
      })),
    })
  } catch (error) {
    console.error('POST sms/conversations/[id]/draft-reply error:', error)
    return errorResponse('Failed to draft a reply', error)
  }
}
