/**
 * GET /api/conversations/[conversationId]
 *
 * Fetches the full message thread for a given Microsoft Graph conversationId.
 * Only accessible to the user who owns the OAuth connection associated with
 * this conversation (verified via email_send_log.user_id).
 *
 * Returns: { messages: GraphMessage[] } ordered oldest→newest.
 * Message bodies are NOT persisted — served directly from Graph.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMicrosoftAccessToken } from '@/lib/integrations/microsoft-connection'
import { MICROSOFT_GRAPH_BASE } from '@/lib/integrations/microsoft-graph'

interface GraphMessage {
  id: string
  subject: string
  receivedDateTime: string
  from: { emailAddress: { address: string; name?: string } }
  toRecipients: { emailAddress: { address: string; name?: string } }[]
  body: { content: string; contentType: string }
}

interface GraphMessagesResponse {
  value: GraphMessage[]
  '@odata.nextLink'?: string
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { conversationId } = await ctx.params
  if (!conversationId) {
    return NextResponse.json(
      { error: 'Missing conversationId' },
      { status: 400 },
    )
  }

  // Verify the current user owns the send log entry for this conversation.
  const admin = createAdminClient()
  const { data: sendRow } = await admin
    .from('email_send_log')
    .select('send_id, user_id')
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle()

  if (!sendRow) {
    return NextResponse.json(
      { error: 'Conversation not found' },
      { status: 404 },
    )
  }
  if (sendRow.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let tokenResult
  try {
    tokenResult = await getMicrosoftAccessToken(user.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: message, needs_connection: true },
      { status: 400 },
    )
  }

  // Fetch all messages in the conversation from Graph.
  const select = 'id,subject,receivedDateTime,from,toRecipients,body'
  const filter = `conversationId eq '${conversationId.replace(/'/g, "''")}'`
  let url: string | undefined =
    `${MICROSOFT_GRAPH_BASE}/me/messages` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$select=${encodeURIComponent(select)}` +
    `&$orderby=${encodeURIComponent('receivedDateTime asc')}` +
    `&$top=50`

  const messages: GraphMessage[] = []
  let pages = 0
  while (url && pages < 5) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Graph fetch failed (${res.status}): ${text}` },
        { status: 502 },
      )
    }
    const page = (await res.json()) as GraphMessagesResponse
    messages.push(...page.value)
    url = page['@odata.nextLink']
    pages++
  }

  return NextResponse.json({ messages })
}
