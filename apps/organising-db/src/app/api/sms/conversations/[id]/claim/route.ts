/**
 * Soft claim on an SMS conversation (collision prevention — warn,
 * don't block; brief §3.1 item 6).
 *
 * POST   — claim/renew via claim_sms_conversation (TTL minutes;
 *          returns { claimed } — false when someone else holds it).
 * DELETE — release own claim via release_sms_conversation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

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

    const body = (await req.json().catch(() => ({}))) as { ttl_minutes?: number }
    const { data: claimed, error } = await supabase.rpc('claim_sms_conversation', {
      p_conversation_id: conversationId,
      p_ttl_minutes: body.ttl_minutes ?? 5,
    })
    if (error) throw error

    if (!claimed) {
      // Surface the current holder so the UI can warn (not block).
      const { data: conv } = await supabase
        .from('sms_conversations')
        .select('claim_user_id, claimed_until')
        .eq('conversation_id', conversationId)
        .maybeSingle()
      let holderName: string | null = null
      if (conv?.claim_user_id) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('user_id', conv.claim_user_id)
          .maybeSingle()
        holderName = profile?.display_name ?? null
      }
      return NextResponse.json({
        claimed: false,
        claim_user_id: conv?.claim_user_id ?? null,
        claimed_until: conv?.claimed_until ?? null,
        holder_name: holderName,
      })
    }

    return NextResponse.json({ claimed: true })
  } catch (error) {
    console.error('POST sms/conversations/[id]/claim error:', error)
    return errorResponse('Failed to claim conversation', error)
  }
}

export async function DELETE(
  _req: NextRequest,
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

    const { data: released, error } = await supabase.rpc(
      'release_sms_conversation',
      { p_conversation_id: conversationId },
    )
    if (error) throw error

    return NextResponse.json({ released: !!released })
  } catch (error) {
    console.error('DELETE sms/conversations/[id]/claim error:', error)
    return errorResponse('Failed to release conversation', error)
  }
}
