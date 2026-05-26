/**
 * GET /api/oauth/microsoft/start
 *
 * Initiates the OAuth authorization-code-with-PKCE flow against
 * Microsoft. We:
 *   1. Verify the user is authenticated.
 *   2. Generate a state (CSRF nonce) + PKCE verifier/challenge.
 *   3. Persist verifier + state + return URL in short-lived,
 *      HTTP-only signed cookies.
 *   4. 302 the user to Microsoft's consent screen.
 *
 * Microsoft redirects back to /api/oauth/microsoft/callback with the
 * authorization code; that route exchanges it for tokens.
 *
 * Query params:
 *   - returnTo  (optional) — relative path to bounce the user back to
 *                            after a successful (or failed) connect.
 *                            Defaults to /administration.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
} from '@/lib/integrations/microsoft-graph'

const STATE_COOKIE = 'oa_ms_state'
const VERIFIER_COOKIE = 'oa_ms_verifier'
const RETURN_TO_COOKIE = 'oa_ms_return_to'
const COOKIE_MAX_AGE = 10 * 60 // 10 minutes

function generateState(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Buffer.from(arr).toString('base64url')
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const returnTo = req.nextUrl.searchParams.get('returnTo') || ''
  const safeReturnTo = returnTo.startsWith('/') ? returnTo : ''

  const state = generateState()
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)

  const authorizeUrl = buildAuthorizeUrl({
    state,
    codeChallenge: challenge,
    loginHint: user.email ?? undefined,
  })

  const response = NextResponse.redirect(authorizeUrl)
  // Persist the short-lived flow state in HTTP-only cookies. These are
  // single-use; the callback reads them once then clears them.
  const cookieBase = {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/oauth/microsoft',
    maxAge: COOKIE_MAX_AGE,
  }
  response.cookies.set(STATE_COOKIE, state, cookieBase)
  response.cookies.set(VERIFIER_COOKIE, verifier, cookieBase)
  if (safeReturnTo) {
    response.cookies.set(RETURN_TO_COOKIE, safeReturnTo, cookieBase)
  }
  return response
}
