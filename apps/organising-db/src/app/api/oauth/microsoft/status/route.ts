/**
 * GET /api/oauth/microsoft/status
 *
 * Returns the connection state for the current user. Used by the UI to
 * render "Connect Outlook" vs "Connected as alice@example.org" + the
 * "Save to Outlook drafts" actions.
 *
 * NEVER returns tokens.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasSendScope } from '@/lib/integrations/microsoft-graph'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('user_oauth_connections')
    .select(
      'connection_id, provider, email, display_name, status, last_error, connected_at, last_used_at, scopes',
    )
    .eq('user_id', user.id)
    .eq('provider', 'microsoft')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ success: true, connected: false })
  }

  return NextResponse.json({
    success: true,
    connected: data.status === 'active',
    status: data.status,
    email: data.email,
    display_name: data.display_name,
    scopes: data.scopes,
    has_send_scope: hasSendScope(data.scopes),
    connected_at: data.connected_at,
    last_used_at: data.last_used_at,
    last_error: data.last_error,
  })
}
