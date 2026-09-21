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
 *   - Mail.Send           → required to send mail directly via /me/sendMail
 *                           (one-click bulk send, no manual Outlook step).
 *                           Users connected before this scope was added
 *                           must reconnect to enable the direct-send path;
 *                           draft creation continues to work without it.
 *
 * Note on consent: drafts-only path remains available even if the user
 * declines the Mail.Send scope at consent time — the connection still
 * works for draft creation. The `has_send_scope` flag exposed via
 * /api/oauth/microsoft/status drives the UI's per-feature gating so the
 * direct-send menu items are disabled gracefully.
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
  'Mail.Send',
].join(' ')

/**
 * Return true if the stored `scope` string includes the Mail.Send scope.
 * Microsoft returns the granted scopes (space-separated) on each token
 * exchange / refresh; we persist this on `user_oauth_connections.scopes`.
 */
export function hasSendScope(scopes: string | null | undefined): boolean {
  if (!scopes) return false
  return scopes
    .split(/\s+/)
    .some((s) => s.trim().toLowerCase() === 'mail.send')
}

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
  /**
   * Microsoft consent prompt. Default `select_account` re-prompts for
   * account selection but re-uses prior consent if scopes are unchanged.
   * Use `consent` to force the consent screen — needed when an existing
   * user has to re-grant after we've added a new scope (e.g. Mail.Send).
   */
  prompt?: 'select_account' | 'consent' | 'login' | 'none'
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
    prompt: input.prompt ?? 'select_account',
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

export interface GraphFileAttachment {
  name: string
  contentType: string
  content: Uint8Array
}

/**
 * Graph's JSON fileAttachment is limited to 3 MB. Larger files use an
 * upload session. Every chunk except the last must be a multiple of 320 KiB.
 */
const GRAPH_SIMPLE_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024
export const GRAPH_UPLOAD_CHUNK_BYTES = 320 * 1024 * 10

export function graphUploadRanges(
  totalBytes: number,
  chunkBytes: number = GRAPH_UPLOAD_CHUNK_BYTES,
): Array<{ start: number; end: number }> {
  if (totalBytes <= 0) return []
  if (chunkBytes <= 0 || chunkBytes % (320 * 1024) !== 0) {
    throw new Error('Graph upload chunks must be a positive multiple of 320 KiB')
  }
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  while (start < totalBytes) {
    const end = Math.min(start + chunkBytes, totalBytes) - 1
    ranges.push({ start, end })
    start = end + 1
  }
  return ranges
}

export interface CreateDraftInput {
  subject: string
  bodyHtml: string
  toRecipients?: GraphRecipient[]
  bccRecipients?: GraphRecipient[]
  ccRecipients?: GraphRecipient[]
  /** Optional Reply-To (otherwise inherits from the user's mailbox). */
  replyTo?: GraphRecipient[]
  /** PDF / document files. Attached after the draft exists so files over 3 MB can upload. */
  attachments?: GraphFileAttachment[]
}

export interface GraphMessageResponse {
  id: string
  conversationId?: string
  webLink?: string
  parentFolderId?: string
}

/**
 * Create a draft email in the connected user's Drafts folder. The user
 * then opens Outlook, finds the draft, optionally edits, and hits send.
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
  const created = (await res.json()) as GraphMessageResponse
  if (input.attachments?.length) {
    try {
      await addGraphFileAttachments(accessToken, created.id, input.attachments)
    } catch (err) {
      await deleteGraphMessage(accessToken, created.id)
      throw err
    }
  }
  return created
}

/**
 * Send a message directly via Graph's /me/sendMail endpoint — bypasses
 * the Drafts folder. Requires the `Mail.Send` scope. The message also
 * appears in the user's Sent Items (saveToSentItems defaults to true).
 *
 * Returns nothing — Graph's /me/sendMail responds with 202 Accepted and
 * no body. For tracking we rely on the audit row written by the caller.
 */
export async function sendMessage(
  accessToken: string,
  input: CreateDraftInput & { saveToSentItems?: boolean },
): Promise<void> {
  // sendMail cannot take an upload session. Create the draft, attach, then
  // send so PDFs over 3 MB use the same path as the campaign send.
  if (input.attachments?.length) {
    await createAndSendMessage(accessToken, input)
    return
  }

  const message: Record<string, unknown> = {
    subject: input.subject || '(no subject)',
    body: {
      contentType: 'HTML',
      content: input.bodyHtml,
    },
  }
  if (input.toRecipients?.length) message.toRecipients = input.toRecipients
  if (input.ccRecipients?.length) message.ccRecipients = input.ccRecipients
  if (input.bccRecipients?.length) message.bccRecipients = input.bccRecipients
  if (input.replyTo?.length) message.replyTo = input.replyTo

  const payload = {
    message,
    saveToSentItems: input.saveToSentItems !== false,
  }

  const res = await fetchApi(`${MICROSOFT_GRAPH_BASE}/me/sendMail`, {
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
    throw new Error(`Graph sendMail failed (${res.status}): ${text}`)
  }
}

/**
 * Create a Graph draft and immediately send it. Unlike /me/sendMail,
 * the create step returns message and conversation ids, allowing the
 * mailbox poller to correlate replies with the in-app inbox.
 */
export async function createAndSendMessage(
  accessToken: string,
  input: CreateDraftInput,
): Promise<GraphMessageResponse> {
  const message = await createDraft(accessToken, input)
  const res = await fetchApi(
    `${MICROSOFT_GRAPH_BASE}/me/messages/${encodeURIComponent(message.id)}/send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      requestId: false,
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph send draft failed (${res.status}): ${text}`)
  }
  return message
}

async function deleteGraphMessage(accessToken: string, messageId: string): Promise<void> {
  await fetchApi(
    `${MICROSOFT_GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      requestId: false,
    },
  ).catch(() => undefined)
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Attach files to an existing Graph message. Files of 3 MB or less use the
 * JSON fileAttachment API. Larger documents use an upload session (up to
 * the caller's own size cap).
 */
export async function addGraphFileAttachments(
  accessToken: string,
  messageId: string,
  files: GraphFileAttachment[],
): Promise<void> {
  for (const file of files) {
    if (file.content.byteLength <= GRAPH_SIMPLE_ATTACHMENT_MAX_BYTES) {
      await addSmallGraphAttachment(accessToken, messageId, file)
    } else {
      await uploadLargeGraphAttachment(accessToken, messageId, file)
    }
  }
}

async function addSmallGraphAttachment(
  accessToken: string,
  messageId: string,
  file: GraphFileAttachment,
): Promise<void> {
  const res = await fetchApi(
    `${MICROSOFT_GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.name,
        contentType: file.contentType,
        contentBytes: bytesToBase64(file.content),
      }),
      requestId: false,
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph add attachment failed (${res.status}): ${text}`)
  }
}

async function uploadLargeGraphAttachment(
  accessToken: string,
  messageId: string,
  file: GraphFileAttachment,
): Promise<void> {
  const sessionRes = await fetchApi(
    `${MICROSOFT_GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments/createUploadSession`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        AttachmentItem: {
          attachmentType: 'file',
          name: file.name,
          size: file.content.byteLength,
          contentType: file.contentType,
        },
      }),
      requestId: false,
    },
  )
  if (!sessionRes.ok) {
    const text = await sessionRes.text()
    throw new Error(`Graph attachment upload session failed (${sessionRes.status}): ${text}`)
  }
  const session = (await sessionRes.json()) as { uploadUrl?: string }
  if (!session.uploadUrl) {
    throw new Error('Graph attachment upload session did not return an upload URL')
  }

  const total = file.content.byteLength
  for (const range of graphUploadRanges(total)) {
    const chunk = Buffer.from(file.content.subarray(range.start, range.end + 1))
    const res = await fetchApi(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
      },
      body: chunk,
      requestId: false,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Graph attachment upload failed (${res.status}): ${text}`)
    }
  }
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
