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

    const payload = (await req.json().catch(() => null)) as { body?: string } | null
    const body = payload?.body?.trim() ?? ''
    if (!body) return NextResponse.json({ error: 'Note body is required' }, { status: 400 })
    if (body.length > 5000) {
      return NextResponse.json(
        { error: 'Note body is too long (maximum 5,000 characters)' },
        { status: 400 },
      )
    }

    const { data: note, error } = await supabase
      .from('email_conversation_notes')
      .insert({
        conversation_id: conversationId,
        author_user_id: user.id,
        body,
      })
      .select('note_id, conversation_id, author_user_id, body, created_at')
      .single()
    if (error) throw error

    return NextResponse.json({ ok: true, note }, { status: 201 })
  } catch (error) {
    console.error('POST email conversation note error:', error)
    return errorResponse('Failed to add note', error)
  }
}
