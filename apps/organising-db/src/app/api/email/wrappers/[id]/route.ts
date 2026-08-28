/**
 * Email wrapper CRUD — update + delete for a single wrapper.
 * Admin-only via RLS (is_admin()); placeholder validation on update.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wrapperHasUnsubscribePlaceholder } from '@/lib/email/wrapper'

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const wrapperId = Number(id)
  if (!Number.isFinite(wrapperId)) {
    return NextResponse.json({ error: 'Invalid wrapper id' }, { status: 400 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { data: existing, error: fetchErr } = await supabase
    .from('email_wrappers')
    .select('*')
    .eq('wrapper_id', wrapperId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim() || null
  if (typeof body.header_html === 'string') updates.header_html = body.header_html
  if (typeof body.footer_html === 'string') updates.footer_html = body.footer_html
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
  if (typeof body.is_default === 'boolean') updates.is_default = body.is_default

  const headerHtml = (updates.header_html ?? existing.header_html) as string
  const footerHtml = (updates.footer_html ?? existing.footer_html) as string
  if (!wrapperHasUnsubscribePlaceholder({ header_html: headerHtml, footer_html: footerHtml })) {
    return NextResponse.json(
      {
        error:
          'The wrapper footer must contain the {{unsubscribe_url}} placeholder — it becomes the mandatory unsubscribe link.',
      },
      { status: 400 },
    )
  }

  if (updates.is_default === true && !existing.is_default) {
    const { error: clearErr } = await supabase
      .from('email_wrappers')
      .update({ is_default: false })
      .eq('is_default', true)
    if (clearErr) {
      return NextResponse.json({ error: clearErr.message }, { status: 500 })
    }
  }

  const { data, error } = await supabase
    .from('email_wrappers')
    .update(updates)
    .eq('wrapper_id', wrapperId)
    .select('*')
    .single()
  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ wrapper: data })
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const wrapperId = Number(id)
  if (!Number.isFinite(wrapperId)) {
    return NextResponse.json({ error: 'Invalid wrapper id' }, { status: 400 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('email_wrappers')
    .delete()
    .eq('wrapper_id', wrapperId)
  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ success: true })
}
