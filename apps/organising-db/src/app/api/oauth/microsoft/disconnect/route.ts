/**
 * POST /api/oauth/microsoft/disconnect
 *
 * Deletes the user's Microsoft connection row. The refresh token is
 * destroyed locally; the user must also visit
 * https://account.live.com/consent/Manage (personal) or
 * https://myapps.microsoft.com (work) if they want to revoke the app's
 * consent at Microsoft's end — we cannot do this for them.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_oauth_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'microsoft')

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    )
  }
  return NextResponse.json({ success: true })
}
