import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import {
  SITUATION_ANALYSIS_CHAT_SYSTEM_PROMPT,
  buildSituationChatContextMessage,
} from '@/lib/prompts/situation-analysis-prompts'
import { loadInternalContext } from '@/lib/situation-analysis/load-internal-context'
import type { SituationAnalysisDraft } from '@/lib/situation-analysis/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequestBody {
  campaign_id: number
  draft: SituationAnalysisDraft
  /** Conversation history. The latest entry should be a user message. */
  messages: ChatTurn[]
}

/**
 * Streaming chat assistant for the situation analysis. Responds with
 * `text/event-stream`-like chunks (newline-delimited JSON) so the client
 * can render the natural-language reply incrementally and parse the
 * trailing `proposed_updates` JSON block once the stream completes.
 *
 * The response wire format is one JSON object per line:
 *   { "type": "delta", "text": "string" }
 *   { "type": "complete", "natural_language": "string", "proposed_updates": {...} | null, "model": "string" }
 *   { "type": "error",  "message": "string" }
 */
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
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      )
    }

    const body: ChatRequestBody = await req.json()
    if (!body.campaign_id || !Number.isInteger(body.campaign_id)) {
      return NextResponse.json({ error: 'Missing campaign_id' }, { status: 400 })
    }
    if (!body.draft || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Missing draft or messages' },
        { status: 400 }
      )
    }
    const lastMessage = body.messages[body.messages.length - 1]
    if (lastMessage.role !== 'user' || !lastMessage.content?.trim()) {
      return NextResponse.json(
        { error: 'Last message must be a non-empty user turn' },
        { status: 400 }
      )
    }

    const { text: internalContext } = await loadInternalContext(
      supabase,
      body.campaign_id
    )

    // Pre-pend the (refreshed) context as an assistant-priming user turn so
    // the model has the latest survey + internal data each turn.
    const contextMessage = buildSituationChatContextMessage({
      internalContext,
      draft: body.draft,
    })

    const anthropicMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: contextMessage },
      {
        role: 'assistant',
        content:
          'Got it — I have the campaign context and your current survey. What would you like me to dig into?',
      },
      ...body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) satisfies Anthropic.MessageParam[],
    ]

    const encoder = new TextEncoder()
    const model = 'claude-sonnet-4-20250514'
    const PROPOSED_UPDATES_MARKER = '---PROPOSED-UPDATES---'

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'))
        }

        let buffer = ''
        try {
          const aiStream = anthropic.messages.stream({
            model,
            max_tokens: 1500,
            system: SITUATION_ANALYSIS_CHAT_SYSTEM_PROMPT,
            messages: anthropicMessages,
          })

          for await (const event of aiStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const text = event.delta.text
              buffer += text
              send({ type: 'delta', text })
            }
          }

          // Parse the final buffer into natural-language + proposed_updates.
          const markerIndex = buffer.indexOf(PROPOSED_UPDATES_MARKER)
          let naturalLanguage = buffer
          let proposedUpdates: Record<string, unknown> | null = null
          if (markerIndex !== -1) {
            naturalLanguage = buffer.slice(0, markerIndex).trim()
            const rest = buffer.slice(markerIndex + PROPOSED_UPDATES_MARKER.length).trim()
            try {
              const fenceMatch = rest.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
              const candidate = fenceMatch ? fenceMatch[1] : rest
              const start = candidate.indexOf('{')
              const end = candidate.lastIndexOf('}')
              if (start !== -1 && end !== -1) {
                proposedUpdates = JSON.parse(candidate.slice(start, end + 1))
              }
            } catch {
              // Leave proposedUpdates null when the model produces malformed
              // JSON. The natural-language reply still makes it to the user.
              proposedUpdates = null
            }
          }

          send({
            type: 'complete',
            natural_language: naturalLanguage,
            proposed_updates: proposedUpdates,
            model,
          })
          controller.close()
        } catch (err) {
          send({
            type: 'error',
            message: err instanceof Error ? err.message : 'Streaming failed',
          })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Situation analysis chat API error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
