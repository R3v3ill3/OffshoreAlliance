/**
 * Email wrapper CRUD — list + create.
 *
 * Reads are open to authenticated staff; writes are admin-only (enforced
 * by RLS `is_admin()` on email_wrappers — the route surfaces the 403).
 * Every save is validated for the mandatory {{unsubscribe_url}}
 * placeholder so a non-compliant wrapper can never be stored.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wrapperHasUnsubscribePlaceholder } from '@/lib/email/wrapper'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('email_wrappers')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ wrappers: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const headerHtml = typeof body?.header_html === 'string' ? body.header_html : ''
  const footerHtml = typeof body?.footer_html === 'string' ? body.footer_html : ''
  const description =
    typeof body?.description === 'string' ? body.description.trim() : null
  const isDefault = body?.is_default === true

  if (!name) {
    return NextResponse.json({ error: 'Wrapper name is required' }, { status: 400 })
  }
  if (!wrapperHasUnsubscribePlaceholder({ header_html: headerHtml, footer_html: footerHtml })) {
    return NextResponse.json(
      {
        error:
          'The wrapper footer must contain the {{unsubscribe_url}} placeholder — it becomes the mandatory unsubscribe link.',
      },
      { status: 400 },
    )
  }

  if (isDefault) {
    // Single default: clear the flag elsewhere first (partial unique index).
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
    .insert({
      name,
      description,
      header_html: headerHtml,
      footer_html: footerHtml,
      is_default: isDefault,
      is_active: body?.is_active !== false,
      created_by: user.id,
    })
    .select('*')
    .single()
  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ wrapper: data })
}
