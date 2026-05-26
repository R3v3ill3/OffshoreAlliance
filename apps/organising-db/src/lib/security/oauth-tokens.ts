/**
 * AES-256-GCM encryption for OAuth refresh + access tokens.
 *
 * Refresh tokens are credentials and must NEVER be stored as plaintext.
 * The wrapping key lives in `OAUTH_TOKEN_ENCRYPTION_KEY` (a 32-byte
 * value, base64-encoded) — set in server env, never reaches the client.
 *
 * Wire format (string stored in DB): base64(iv || ciphertext || authTag)
 *   iv         = 12 bytes (GCM standard)
 *   authTag    = 16 bytes (GCM standard)
 *   ciphertext = variable
 *
 * Rotation: to rotate, generate a new key, prepend a 1-byte version tag
 * to the encrypted output, and migrate old rows lazily on next refresh.
 * (Not implemented in v1 — current schema is single-key.)
 */

import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32 // 256 bits
const IV_LEN = 12

function loadKey(): Buffer {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'OAUTH_TOKEN_ENCRYPTION_KEY env var is not set. Generate with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== KEY_LEN) {
    throw new Error(
      `OAUTH_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (current: ${key.length}). ` +
        'Generate a new key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  return key
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error('encryptToken: empty plaintext')
  const key = loadKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64')
}

export function decryptToken(blob: string): string {
  if (!blob) throw new Error('decryptToken: empty blob')
  const key = loadKey()
  const buf = Buffer.from(blob, 'base64')
  if (buf.length < IV_LEN + 16 + 1) {
    throw new Error('decryptToken: ciphertext too short to be valid')
  }
  const iv = buf.subarray(0, IV_LEN)
  const authTag = buf.subarray(buf.length - 16)
  const ciphertext = buf.subarray(IV_LEN, buf.length - 16)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

/** Helper for CLI / one-off setup: generate a fresh 32-byte base64 key. */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LEN).toString('base64')
}
