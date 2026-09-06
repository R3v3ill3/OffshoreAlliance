import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/error-response'
import { createClient } from '@/lib/supabase/server'

function parseReplyId(raw: string): number | null {
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const replyId = parseReplyId(id)
    if (replyId == null) {
      return NextResponse.json({ error: 'Invalid saved reply id' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as {
      title?: string
      body?: string
      campaign_id?: number | null
      is_active?: boolean
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const updates: Record<string, string | number | boolean | null> = {}
    if (body.title !== undefined) {
      const title = body.title.trim()
      if (!title || title.length > 120) {
        return NextResponse.json(
          { error: 'Title must be between 1 and 120 characters' },
          { status: 400 },
        )
      }
      updates.title = title
    }
    if (body.body !== undefined) {
      const replyBody = body.body.trim()
      if (!replyBody || replyBody.length > 10_000) {
        return NextResponse.json(
          { error: 'Reply body must be between 1 and 10,000 characters' },
          { status: 400 },
        )
      }
      updates.body = replyBody
    }
    if (body.campaign_id !== undefined) {
      if (
        body.campaign_id !== null &&
        (!Number.isFinite(body.campaign_id) || body.campaign_id <= 0)
      ) {
        return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
      }
      updates.campaign_id = body.campaign_id
    }
    if (body.is_active !== undefined) updates.is_active = body.is_active
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_canned_replies')
      .update(updates)
      .eq('reply_id', replyId)
      .select(
        'reply_id, campaign_id, title, body, created_by, is_active, created_at, updated_at',
      )
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json(
        { error: 'Saved reply not found or no write access' },
        { status: 404 },
      )
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH email/canned-replies/[id] error:', error)
    return errorResponse('Failed to update saved reply', error)
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const replyId = parseReplyId(id)
    if (replyId == null) {
      return NextResponse.json({ error: 'Invalid saved reply id' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('email_canned_replies')
      .update({ is_active: false })
      .eq('reply_id', replyId)
      .select('reply_id')
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json(
        { error: 'Saved reply not found or no write access' },
        { status: 404 },
      )
    }
    return NextResponse.json({ archived: true })
  } catch (error) {
    console.error('DELETE email/canned-replies/[id] error:', error)
    return errorResponse('Failed to archive saved reply', error)
  }
}
