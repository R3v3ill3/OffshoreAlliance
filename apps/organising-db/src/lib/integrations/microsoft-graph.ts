/**
 * Microsoft Graph + Azure AD OAuth client for the "Save to Outlook
 * drafts" integration.
 *
 * Tenant strategy: 'organizations' — work / school accounts only
 * (Microsoft 365 / Office 365). Personal Outlook.com accounts are
 * intentionally excluded; switch to 'common' if that changes.
 *
 * Scopes:
 *   - offline_access      → returns a refresh token (~90 day rolling)
 *   - openid + profile    → required for User.Read to give us name/email
 *   - User.Read           → so we can display the connected mailbox
 *   - Mail.ReadWrite      → required to create drafts in /me/messages
 *
 * We deliberately do NOT request Mail.Send — drafts only. The user does
 * the actual send from inside Outlook so they retain final control and
 * the email leaves their own account with their own signature.
 */

import { fetchApi } from '@/lib/api/fetch-api'

export const MICROSOFT_TENANT = 'organizations'

export const MICROSOFT_AUTHORIZE_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize`
export const MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`
export const MICROSOFT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export const MICROSOFT_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'User.Read',
  'Mail.ReadWrite',
].join(' ')

export interface MsTokenResponse {
  token_type: 'Bearer'
  scope: string
  expires_in: number
  ext_expires_in?: number
  access_token: string
  refresh_token?: string
  id_token?: string
}

export interface MsUserProfile {
  id: string
  displayName?: string
  givenName?: string
  surname?: string
  userPrincipalName?: string
  mail?: string
  jobTitle?: string
}

export function requireMicrosoftEnv(): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Microsoft OAuth env vars missing. Need MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI. See docs/OUTLOOK_OAUTH_SETUP.md.',
    )
  }
  return { clientId, clientSecret, redirectUri }
}

/**
 * Build the consent URL the user is redirected to at the start of the
 * OAuth flow. State (CSRF) and code_challenge (PKCE) are caller-supplied
 * because they need to be persisted in the user's session for the
 * subsequent callback to verify.
 */
export function buildAuthorizeUrl(input: {
  state: string
  codeChallenge: string
  loginHint?: string
}): string {
  const { clientId, redirectUri } = requireMicrosoftEnv()
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MICROSOFT_SCOPES,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  if (input.loginHint) params.set('login_hint', input.loginHint)
  return `${MICROSOFT_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Exchange the authorization code (returned in the callback) for an
 * access + refresh token pair. PKCE verifier must match the challenge
 * that was sent in the authorize step.
 */
export async function exchangeCodeForTokens(input: {
  code: string
  codeVerifier: string
}): Promise<MsTokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireMicrosoftEnv()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: redirectUri,
    code_verifier: input.codeVerifier,
    scope: MICROSOFT_SCOPES,
  })
  const res = await fetchApi(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    requestId: false,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft token exchange failed (${res.status}): ${text}`)
  }
  return (await res.json()) as MsTokenResponse
}

/**
 * Use the refresh token to obtain a new access token. Microsoft may also
 * return a rotated refresh token — callers must persist it if present.
 */
export async function refreshTokens(refreshToken: string): Promise<MsTokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireMicrosoftEnv()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES,
    redirect_uri: redirectUri,
  })
  const res = await fetchApi(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    requestId: false,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft refresh failed (${res.status}): ${text}`)
  }
  return (await res.json()) as MsTokenResponse
}

export async function fetchUserProfile(accessToken: string): Promise<MsUserProfile> {
  const res = await fetchApi(`${MICROSOFT_GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    requestId: false,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph /me failed (${res.status}): ${text}`)
  }
  return (await res.json()) as MsUserProfile
}

export interface GraphRecipient {
  emailAddress: { address: string; name?: string }
}

export interface CreateDraftInput {
  subject: string
  bodyHtml: string
  toRecipients?: GraphRecipient[]
  bccRecipients?: GraphRecipient[]
  ccRecipients?: GraphRecipient[]
  /** Optional Reply-To (otherwise inherits from the user's mailbox). */
  replyTo?: GraphRecipient[]
}

export interface GraphMessageResponse {
  id: string
  webLink?: string
  parentFolderId?: string
}

/**
 * Create a draft email in the connected user's Drafts folder. The user
 * then opens Outlook, finds the draft, optionally edits, and hits send.
 *
 * NB: We never send the message ourselves. Mail.Send is intentionally
 * not in our scope set.
 */
export async function createDraft(
  accessToken: string,
  input: CreateDraftInput,
): Promise<GraphMessageResponse> {
  const payload: Record<string, unknown> = {
    subject: input.subject || '(no subject)',
    body: {
      contentType: 'HTML',
      content: input.bodyHtml,
    },
  }
  if (input.toRecipients?.length) payload.toRecipients = input.toRecipients
  if (input.ccRecipients?.length) payload.ccRecipients = input.ccRecipients
  if (input.bccRecipients?.length) payload.bccRecipients = input.bccRecipients
  if (input.replyTo?.length) payload.replyTo = input.replyTo

  const res = await fetchApi(`${MICROSOFT_GRAPH_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    requestId: false,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph createDraft failed (${res.status}): ${text}`)
  }
  return (await res.json()) as GraphMessageResponse
}

/** PKCE helpers — Node Web Crypto compatible. */
export function generateCodeVerifier(): string {
  // RFC 7636: 43-128 chars, URL-safe.
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return base64UrlEncode(arr)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(buf: Uint8Array): string {
  let s: string
  if (typeof Buffer !== 'undefined') {
    s = Buffer.from(buf).toString('base64')
  } else {
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    s = btoa(bin)
  }
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
