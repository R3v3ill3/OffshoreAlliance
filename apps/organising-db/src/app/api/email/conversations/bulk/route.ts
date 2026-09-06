import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

const UNIQUE_VIOLATION = '23505'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = (await req.json().catch(() => null)) as {
      conversation_ids?: number[]
      operation?: {
        action?: 'assign' | 'mark_read' | 'close' | 'attach'
        user_id?: string | null
        campaign_id?: number | null
      }
    } | null
    const conversationIds = [
      ...new Set(
        (payload?.conversation_ids ?? []).filter(
          (id) => Number.isFinite(id) && id > 0,
        ),
      ),
    ].slice(0, 200)
    if (conversationIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one conversation' },
        { status: 400 },
      )
    }

    const operation = payload?.operation
    let updates: Record<string, unknown>
    let eventType: 'assigned' | 'state_changed' | 'campaign_attached' | null =
      null
    let detail: Record<string, unknown> = {}
    switch (operation?.action) {
      case 'assign':
        updates = { assignee_user_id: operation.user_id ?? null }
        eventType = 'assigned'
        detail = { to_user_id: operation.user_id ?? null, bulk: true }
        break
      case 'mark_read':
        updates = { unread_count: 0 }
        break
      case 'close':
        updates = {
          state: 'closed',
          unread_count: 0,
          closed_at: new Date().toISOString(),
          closed_by_user_id: user.id,
        }
        eventType = 'state_changed'
        detail = { to: 'closed', bulk: true }
        break
      case 'attach':
        if (
          operation.campaign_id !== null &&
          (operation.campaign_id == null ||
            !Number.isFinite(operation.campaign_id))
        ) {
          return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
        }
        updates = { campaign_id: operation.campaign_id ?? null }
        eventType = 'campaign_attached'
        detail = { to_campaign_id: operation.campaign_id ?? null, bulk: true }
        break
      default:
        return NextResponse.json({ error: 'Unknown bulk action' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('email_conversations')
      .update(updates)
      .in('conversation_id', conversationIds)
      .select('conversation_id')
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          {
            error:
              'One or more selected addresses already have a conversation in that campaign.',
          },
          { status: 409 },
        )
      }
      throw error
    }

    if (eventType && (updated ?? []).length > 0) {
      const { error: eventError } = await supabase
        .from('email_conversation_events')
        .insert(
          (updated ?? []).map((conversation) => ({
            conversation_id: conversation.conversation_id,
            actor_user_id: user.id,
            event_type: eventType,
            detail,
          })),
        )
      if (eventError) {
        console.error('Bulk email workflow event append failed:', eventError)
      }
    }

    return NextResponse.json({ updated: updated?.length ?? 0 })
  } catch (error) {
    console.error('POST email conversation bulk action error:', error)
    return errorResponse('Failed to update conversations', error)
  }
}
