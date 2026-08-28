/**
 * Email wrapper application + compliance validation.
 *
 * A wrapper is a reusable header/footer shell (email_wrappers) placed
 * around the draft body at platform send time. The footer must carry the
 * {{unsubscribe_url}} placeholder — the Spam Act requires a functional
 * unsubscribe facility on every commercial message, so wrapper saves are
 * validated here and the dispatcher re-validates the resolved HTML
 * before anything leaves (hard failure pauses the list).
 */

export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}'

export interface EmailWrapperShell {
  header_html: string
  footer_html: string
}

/** True when the wrapper's footer carries the unsubscribe placeholder. */
export function wrapperHasUnsubscribePlaceholder(
  wrapper: EmailWrapperShell,
): boolean {
  return (
    wrapper.footer_html.includes(UNSUBSCRIBE_PLACEHOLDER) ||
    wrapper.header_html.includes(UNSUBSCRIBE_PLACEHOLDER)
  )
}

/**
 * Wrap the (already merge-resolved, sanitised) body HTML in the wrapper
 * shell and resolve the per-recipient unsubscribe URL.
 */
export function applyWrapper(
  bodyHtml: string,
  wrapper: EmailWrapperShell,
  opts: { unsubscribeUrl: string },
): string {
  const wrapped = `${wrapper.header_html}${bodyHtml}${wrapper.footer_html}`
  return wrapped.split(UNSUBSCRIBE_PLACEHOLDER).join(opts.unsubscribeUrl)
}

/**
 * Final compliance gate on the resolved outbound HTML: an unsubscribe
 * link must be present and no unresolved placeholder may remain.
 */
export function validateOutboundHtml(html: string): {
  ok: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (html.includes(UNSUBSCRIBE_PLACEHOLDER)) {
    errors.push('The {{unsubscribe_url}} placeholder was not resolved.')
  }
  if (!/\/u\/[A-Za-z0-9\-_]+/.test(html)) {
    errors.push(
      'No unsubscribe link found — the wrapper footer must contain the {{unsubscribe_url}} placeholder.',
    )
  }
  return { ok: errors.length === 0, errors }
}

/** Chars for URL-safe token generation (clone of click-tracker). */
const TOKEN_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function generateUnsubscribeToken(length = 22): string {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => TOKEN_CHARS[b % TOKEN_CHARS.length])
    .join('')
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://oa.uconstruct.app'

export function unsubscribeUrlForToken(token: string): string {
  return `${BASE_URL.replace(/\/$/, '')}/u/${token}`
}

/**
 * Build the List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058
 * one-click) for a send.
 */
export function buildListUnsubscribeHeaders(
  unsubscribeUrl: string,
  mailboxAddress?: string,
): Record<string, string> {
  const parts: string[] = []
  if (mailboxAddress) parts.push(`<mailto:${mailboxAddress}?subject=unsubscribe>`)
  parts.push(`<${unsubscribeUrl}>`)
  return {
    'List-Unsubscribe': parts.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
