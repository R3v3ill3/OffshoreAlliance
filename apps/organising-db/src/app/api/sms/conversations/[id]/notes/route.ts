/**
 * POST /api/sms/conversations/[id]/notes — add an internal "Whisper"
 * note (never sent to the member; rendered inline in the thread).
 * RLS: author-stamped insert (author_user_id must equal auth.uid()).
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

    const payload = (await req.json()) as { body?: string }
    const body = payload.body?.trim()
    if (!body) {
      return NextResponse.json({ error: 'Note body is required' }, { status: 400 })
    }

    const { data: note, error } = await supabase
      .from('sms_conversation_notes')
      .insert({
        conversation_id: conversationId,
        author_user_id: user.id,
        body,
      })
      .select('*')
      .single()
    if (error) throw error

    return NextResponse.json({ ok: true, note }, { status: 201 })
  } catch (error) {
    console.error('POST sms/conversations/[id]/notes error:', error)
    return errorResponse('Failed to add note', error)
  }
}
