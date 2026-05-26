/**
 * Click-tracking utilities for outbound email links.
 *
 * Rewrites <a href="..."> attributes in email HTML to point through our
 * redirector at /r/[token] so we can record first-click and click-count
 * per recipient.
 *
 * Scope: Outlook send paths only.  Action Network handles its own clicks.
 * Skip: mailto:, tel:, #anchors, unsubscribe links.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://oa.uconstruct.app'

/** Chars for URL-safe base64-like token generation. */
const TOKEN_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function generateToken(length = 22): string {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => TOKEN_CHARS[b % TOKEN_CHARS.length])
    .join('')
}

function shouldRewriteUrl(href: string): boolean {
  if (!href) return false
  const lower = href.toLowerCase().trim()
  if (
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('#')
  )
    return false
  // Skip unsubscribe-type links
  if (/unsubscribe|optout|opt-out/i.test(lower)) return false
  // Must be an absolute HTTP/HTTPS URL
  return lower.startsWith('http://') || lower.startsWith('https://')
}

export interface RewriteResult {
  html: string
  tokens: Array<{ token: string; targetUrl: string }>
}

/**
 * Parses the email HTML, rewrites outbound <a href> attributes to route
 * through the /r/[token] redirector, and returns the modified HTML plus
 * the token→URL mappings for batch insertion into email_click_tokens.
 *
 * sendId must already exist in email_send_log before calling this.
 */
export async function rewriteLinks(
  html: string,
  sendId: number,
): Promise<RewriteResult> {
  const urlToToken = new Map<string, string>()
  const tokens: Array<{ token: string; targetUrl: string }> = []

  // Regex-based rewriter — sufficient for the controlled HTML we generate
  // (tiptap/ProseMirror output).  Not parsing the full DOM avoids a DOM
  // dependency in the Node.js edge runtime.
  const rewritten = html.replace(
    /(<a\s[^>]*href\s*=\s*)(['"])(.*?)\2/gi,
    (match, prefix, quote, href) => {
      if (!shouldRewriteUrl(href)) return match
      if (!urlToToken.has(href)) {
        const token = generateToken()
        urlToToken.set(href, token)
        tokens.push({ token, targetUrl: href })
      }
      const token = urlToToken.get(href)!
      return `${prefix}${quote}${BASE_URL}/r/${token}${quote}`
    },
  )

  if (tokens.length > 0) {
    const admin = createAdminClient()
    await admin.from('email_click_tokens').insert(
      tokens.map((t) => ({
        token: t.token,
        send_id: sendId,
        target_url: t.targetUrl,
      })),
    )
  }

  return { html: rewritten, tokens }
}
