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
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = (await req.json().catch(() => ({}))) as {
      ttl_minutes?: number
    }
    const ttlMinutes = Math.min(Math.max(payload.ttl_minutes ?? 5, 1), 30)
    const now = new Date()
    const claimedUntil = new Date(now.getTime() + ttlMinutes * 60_000).toISOString()
    const { data: claimed, error } = await supabase
      .from('email_conversations')
      .update({ claim_user_id: user.id, claimed_until: claimedUntil })
      .eq('conversation_id', conversationId)
      .or(
        `claim_user_id.is.null,claim_user_id.eq.${user.id},claimed_until.is.null,claimed_until.lt.${now.toISOString()}`,
      )
      .select('claim_user_id, claimed_until')
      .maybeSingle()
    if (error) throw error
    if (claimed) {
      return NextResponse.json({ claimed: true, claimed_until: claimed.claimed_until })
    }

    const { data: conversation } = await supabase
      .from('email_conversations')
      .select('claim_user_id, claimed_until')
      .eq('conversation_id', conversationId)
      .maybeSingle()
    let holderName: string | null = null
    if (conversation?.claim_user_id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', conversation.claim_user_id)
        .maybeSingle()
      holderName = profile?.display_name ?? null
    }
    return NextResponse.json({
      claimed: false,
      holder_name: holderName,
      claimed_until: conversation?.claimed_until ?? null,
    })
  } catch (error) {
    console.error('POST email conversation claim error:', error)
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
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('email_conversations')
      .update({ claim_user_id: null, claimed_until: null })
      .eq('conversation_id', conversationId)
      .eq('claim_user_id', user.id)
    if (error) throw error
    return NextResponse.json({ released: true })
  } catch (error) {
    console.error('DELETE email conversation claim error:', error)
    return errorResponse('Failed to release conversation', error)
  }
}
