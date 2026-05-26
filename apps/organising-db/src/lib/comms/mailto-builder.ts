/**
 * Build mailto: links for local-client handoff.
 *
 * The well-tested cross-platform ceiling for total URL length is ~1800
 * characters (encoded). Beyond that, Windows + Outlook combos silently
 * truncate. Use `MAILTO_MAX_LEN` to decide between mailto and .eml.
 */

export const MAILTO_MAX_LEN = 1800

export interface MailtoInput {
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
}

export interface MailtoResult {
  href: string
  length: number
  fits: boolean
}

export function buildMailto(input: MailtoInput): MailtoResult {
  const params: string[] = []

  const toList = (input.to ?? []).filter(isValidEmail).join(',')
  const ccList = (input.cc ?? []).filter(isValidEmail).join(',')
  const bccList = (input.bcc ?? []).filter(isValidEmail).join(',')

  if (ccList) params.push(`cc=${encodeURIComponent(ccList)}`)
  if (bccList) params.push(`bcc=${encodeURIComponent(bccList)}`)
  if (input.subject) params.push(`subject=${encodeURIComponent(input.subject)}`)
  if (input.body) params.push(`body=${encodeURIComponent(input.body)}`)

  const query = params.length ? `?${params.join('&')}` : ''
  // Per RFC 6068, the address portion before `?` is the comma-joined
  // list of recipients with minimal encoding. Encoding `@` as %40
  // works in major clients but reduces readability — keep it raw.
  const href = `mailto:${toList}${query}`
  return { href, length: href.length, fits: href.length <= MAILTO_MAX_LEN }
}

export function isValidEmail(addr: string): boolean {
  if (!addr) return false
  // Permissive RFC-5322-ish check; we just want to filter obvious garbage.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.trim())
}

/**
 * Naively convert an HTML body to plain text for mailto: (HTML bodies are
 * not supported by any major client on the mailto path).
 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/\r/g, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
