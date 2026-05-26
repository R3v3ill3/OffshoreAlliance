/**
 * Server-side helper for fetching the current user's Microsoft OAuth
 * connection, refreshing tokens transparently, and persisting any
 * rotated refresh token back to the DB.
 *
 * Always called from API routes — never reaches the client (would
 * leak credentials).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken, encryptToken } from '@/lib/security/oauth-tokens'
import { refreshTokens, type MsTokenResponse } from './microsoft-graph'

export interface MsConnection {
  connection_id: number
  user_id: string
  provider_user_id: string
  email: string | null
  display_name: string | null
  tenant_id: string | null
  scopes: string
  status: 'active' | 'revoked' | 'error'
  last_error: string | null
}

export interface MsAccessTokenResult {
  connection: MsConnection
  accessToken: string
  expiresAt: Date
  refreshed: boolean
}

const REFRESH_SKEW_MS = 60 * 1000 // refresh if <60s left

/**
 * Returns a valid access token for the user's connection, refreshing
 * (and persisting the rotated refresh token, if any) if the cached
 * access token has expired or is about to.
 *
 * Throws if the user has no connection or the refresh fails terminally.
 */
export async function getMicrosoftAccessToken(
  userId: string,
): Promise<MsAccessTokenResult> {
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('user_oauth_connections')
    .select(
      'connection_id, user_id, provider_user_id, email, display_name, tenant_id, scopes, status, last_error, access_token_ct, access_token_expires_at, refresh_token_ct',
    )
    .eq('user_id', userId)
    .eq('provider', 'microsoft')
    .maybeSingle()
  if (error) throw error
  if (!row) {
    throw new Error('No Microsoft connection for this user.')
  }
  if (row.status !== 'active') {
    throw new Error(
      `Microsoft connection is ${row.status}${row.last_error ? `: ${row.last_error}` : ''}`,
    )
  }

  const connection: MsConnection = {
    connection_id: row.connection_id,
    user_id: row.user_id,
    provider_user_id: row.provider_user_id,
    email: row.email,
    display_name: row.display_name,
    tenant_id: row.tenant_id,
    scopes: row.scopes,
    status: row.status,
    last_error: row.last_error,
  }

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at)
    : null
  const now = Date.now()

  if (row.access_token_ct && expiresAt && expiresAt.getTime() - REFRESH_SKEW_MS > now) {
    return {
      connection,
      accessToken: decryptToken(row.access_token_ct),
      expiresAt,
      refreshed: false,
    }
  }

  // Refresh.
  const refreshTokenPlain = decryptToken(row.refresh_token_ct)
  let token: MsTokenResponse
  try {
    token = await refreshTokens(refreshTokenPlain)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from('user_oauth_connections')
      .update({
        status: 'error',
        last_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('connection_id', connection.connection_id)
    throw new Error(`Microsoft refresh failed: ${message}`)
  }

  const newExpiry = new Date(Date.now() + token.expires_in * 1000)
  const update: Record<string, unknown> = {
    access_token_ct: encryptToken(token.access_token),
    access_token_expires_at: newExpiry.toISOString(),
    last_used_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active',
    last_error: null,
  }
  if (token.refresh_token) {
    // Microsoft rotates refresh tokens — store the new one.
    update.refresh_token_ct = encryptToken(token.refresh_token)
  }
  if (token.scope) update.scopes = token.scope

  await admin
    .from('user_oauth_connections')
    .update(update)
    .eq('connection_id', connection.connection_id)

  return {
    connection,
    accessToken: token.access_token,
    expiresAt: newExpiry,
    refreshed: true,
  }
}

/**
 * Mark the user's last_used_at — call after a successful save batch so
 * Microsoft's "inactive for 90 days" refresh-token clock resets.
 */
export async function touchLastUsed(userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('user_oauth_connections')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'microsoft')
}
