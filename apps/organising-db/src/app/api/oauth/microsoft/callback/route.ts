/**
 * GET /api/oauth/microsoft/callback
 *
 * Microsoft redirects here with either `?code=...&state=...` (success)
 * or `?error=...&error_description=...` (consent denied / failed).
 *
 * On success we:
 *   1. Match `state` against the cookie planted by /start (CSRF check).
 *   2. Exchange the code for access + refresh tokens (PKCE proof).
 *   3. Fetch the connected mailbox profile from Graph /me.
 *   4. Upsert into user_oauth_connections with ciphertext tokens.
 *   5. Redirect to the original returnTo (or /administration).
 *
 * On failure (or denied consent) we redirect with `?oauth=denied` so the
 * UI can surface a friendly message.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/security/oauth-tokens'
import {
  exchangeCodeForTokens,
  fetchUserProfile,
  MICROSOFT_TENANT,
} from '@/lib/integrations/microsoft-graph'

const STATE_COOKIE = 'oa_ms_state'
const VERIFIER_COOKIE = 'oa_ms_verifier'
const RETURN_TO_COOKIE = 'oa_ms_return_to'

function clearFlowCookies(res: NextResponse): NextResponse {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, RETURN_TO_COOKIE]) {
    res.cookies.set(name, '', {
      path: '/api/oauth/microsoft',
      maxAge: 0,
    })
  }
  return res
}

function redirectWithStatus(
  origin: string,
  returnTo: string,
  status: 'connected' | 'denied' | 'error',
  detail?: string,
): NextResponse {
  const url = new URL(returnTo, origin)
  url.searchParams.set('oauth', status)
  if (detail) url.searchParams.set('oauth_detail', detail.slice(0, 120))
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = req.nextUrl
  const origin = url.origin
  const returnTo = req.cookies.get(RETURN_TO_COOKIE)?.value || '/administration'

  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  if (error) {
    const r = redirectWithStatus(
      origin,
      returnTo,
      error === 'access_denied' ? 'denied' : 'error',
      errorDescription || error,
    )
    return clearFlowCookies(r)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = req.cookies.get(STATE_COOKIE)?.value
  const verifier = req.cookies.get(VERIFIER_COOKIE)?.value

  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    const r = redirectWithStatus(
      origin,
      returnTo,
      'error',
      'invalid_state_or_code',
    )
    return clearFlowCookies(r)
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, codeVerifier: verifier })
    if (!tokens.refresh_token) {
      // Should never happen with offline_access in scope, but guard.
      throw new Error('Microsoft did not return a refresh token.')
    }
    const profile = await fetchUserProfile(tokens.access_token)

    const admin = createAdminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    const row = {
      user_id: user.id,
      provider: 'microsoft' as const,
      provider_user_id: profile.id,
      email: profile.mail || profile.userPrincipalName || null,
      display_name: profile.displayName || null,
      tenant_id: MICROSOFT_TENANT,
      scopes: tokens.scope || '',
      access_token_ct: encryptToken(tokens.access_token),
      access_token_expires_at: expiresAt.toISOString(),
      refresh_token_ct: encryptToken(tokens.refresh_token),
      status: 'active' as const,
      last_error: null,
      last_used_at: null,
      updated_at: new Date().toISOString(),
    }

    // Upsert by (user_id, provider).
    const { error: upsertErr } = await admin
      .from('user_oauth_connections')
      .upsert(row, { onConflict: 'user_id,provider' })
    if (upsertErr) throw upsertErr

    const r = redirectWithStatus(origin, returnTo, 'connected', profile.mail ?? undefined)
    return clearFlowCookies(r)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Microsoft OAuth callback error:', message)
    const r = redirectWithStatus(origin, returnTo, 'error', message)
    return clearFlowCookies(r)
  }
}
