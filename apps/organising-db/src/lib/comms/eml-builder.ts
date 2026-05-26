/**
 * RFC 5322 / MIME builder for "open in mail client" handoff.
 *
 * Produces a `.eml` file the user downloads and double-clicks. With the
 * `X-Unsent: 1` header set, Apple Mail, Outlook Classic / Outlook for Mac,
 * and Thunderbird open the file as an editable draft (not a received
 * message). NB: New Outlook for Windows has regressed this in 2024–25 and
 * may open the file read-only or strip the body — surface a warning in
 * UI when offering the .eml path.
 *
 * Recipients go into the `Bcc:` header so a single message body is shared
 * across the list. Per-recipient personalisation is not supported on this
 * path — caller must resolve campaign variables first and strip recipient
 * tokens (or substitute collective phrasing) before building.
 */

import { createMimeMessage } from 'mimetext/browser'

export interface BuildEmlInput {
  from?: string
  fromName?: string
  replyTo?: string
  subject: string
  /** Plain-text body. Use `bodyHtml` for the rich version. */
  bodyText: string
  /** Optional sanitised HTML body. If present, message is sent multipart. */
  bodyHtml?: string | null
  /** All recipients go into Bcc by default — single shared body. */
  bcc: string[]
  /** Optional To (e.g. user's own address as a holder, or test recipient). */
  to?: string[]
}

const OA_FROM_NAME = 'Offshore Alliance'
const OA_REPLY_TO = 'info@offshorealliance.org.au'

export function buildEml(input: BuildEmlInput): Blob {
  const msg = createMimeMessage()

  msg.setSender({
    name: input.fromName ?? OA_FROM_NAME,
    addr: input.from ?? OA_REPLY_TO,
  })

  if (input.to && input.to.length > 0) {
    msg.setRecipients(input.to.map((addr) => ({ addr })))
  }

  if (input.bcc.length > 0) {
    msg.setRecipients(
      input.bcc.map((addr) => ({ addr, type: 'Bcc' as const })),
    )
  }

  msg.setSubject(input.subject || '(no subject)')

  // Reply-To: only set if the caller explicitly passed one. We deliberately
  // do NOT default to OA's info@ address — when the user opens this draft
  // in their own mail client and sends, replies should come back to them,
  // not to the OA shared inbox. mimetext v3 is strict about Reply-To header
  // values (must parse as a Mailbox); wrap in try/catch so a malformed
  // input.replyTo never blocks the whole download.
  if (input.replyTo) {
    try {
      msg.setHeader('Reply-To', formatMailbox(input.replyTo))
    } catch {
      // Silently skip — better a draft without Reply-To than no draft at all.
    }
  }
  // Critical: X-Unsent: 1 marks the .eml as a draft to open for editing.
  msg.setHeader('X-Unsent', '1')

  if (input.bodyHtml && input.bodyHtml.trim()) {
    msg.addMessage({
      contentType: 'text/plain',
      data: input.bodyText || stripHtml(input.bodyHtml),
    })
    msg.addMessage({
      contentType: 'text/html',
      data: input.bodyHtml,
    })
  } else {
    msg.addMessage({
      contentType: 'text/plain',
      data: input.bodyText,
    })
  }

  const raw = msg.asRaw()
  return new Blob([raw], { type: 'message/rfc822' })
}

export function downloadEml(input: BuildEmlInput, filename = 'draft.eml'): void {
  const blob = buildEml(input)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.eml') ? filename : `${filename}.eml`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Slight delay so the click actually fires the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * Coerce a bare email or "Name <email>" string into mimetext v3's
 * expected mailbox format. mimetext rejects bare emails on address-type
 * headers like Reply-To unless they parse as a Mailbox; the safest form
 * is "Display Name <addr@host>".
 */
function formatMailbox(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('empty mailbox')
  // Already has "Name <addr>" or "<addr>" structure.
  if (/<[^@\s]+@[^@\s]+>/.test(trimmed)) return trimmed
  // Bare addr — wrap in angle brackets so mimetext's parser accepts it.
  return `<${trimmed}>`
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h\d|li)>/gi, '\n')
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
