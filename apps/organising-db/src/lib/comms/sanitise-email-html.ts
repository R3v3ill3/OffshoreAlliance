/**
 * Server-side defensive HTML sanitiser for email bodies sent to Action
 * Network, Outlook drafts, or any downstream system that doesn't deal
 * gracefully with junk attributes.
 *
 * Why a regex-based sanitiser instead of DOMPurify / parse5:
 *   - `isomorphic-dompurify` pulls in jsdom which fails to bundle cleanly
 *     in Vercel's Next.js serverless runtime (ERR_REQUIRE_ESM jsdom).
 *   - We only need attribute scrubbing, not parser-quality sanitisation —
 *     the input is already valid HTML emitted by our TipTap editor.
 *   - The threat model is "remove formatting noise from pasted Outlook /
 *     Gmail HTML so AN's plain-text generator works cleanly" — not
 *     defending against XSS, which is already handled client-side.
 *
 * Operations:
 *   - Drop ALL attributes on every tag except a small allowlist per tag.
 *   - Drop entire tags not on the tag allowlist (script, style, meta, etc).
 *   - Collapse multiple spaces / newlines inside tag definitions (Outlook
 *     web love putting tag-internal newlines that confuse plain-text
 *     converters).
 *
 * Tag allowlist matches the EmailBodyEditor's DOMPurify allowlist so
 * server output equals client output even if the client sanitiser was
 * bypassed for some reason.
 */

// Tag-level allowlist. Tags NOT in this set are removed (content kept).
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'span',
  'div',
])

// Per-tag attribute allowlist. Attributes NOT listed are removed.
const ATTR_ALLOWLIST: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  // span: keep `data-merge-field` so chip preservation still works for
  // any code path that hasn't run stripMergeFieldChips first.
  span: new Set(['data-merge-field']),
  // All other tags: no attributes survive.
}

// Tags whose content should also be dropped (not just the tag wrapper).
const DROP_WITH_CONTENT = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'meta', 'link'])

/**
 * Drop disallowed attributes, drop disallowed tags, and clean common
 * junk from Outlook / Gmail paste sources. Returns clean HTML safe to
 * send to Action Network's message API and friendly to plain-text
 * generation.
 */
export function sanitiseEmailHtml(html: string): string {
  if (!html) return html
  let out = html

  // 1. Drop tags whose content should NOT survive (script, style, etc).
  for (const tag of DROP_WITH_CONTENT) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi')
    out = out.replace(re, '')
    // Self-closing variants.
    const reSelf = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi')
    out = out.replace(reSelf, '')
  }

  // 2. Drop HTML comments — Outlook adds tons of conditional comments.
  out = out.replace(/<!--[\s\S]*?-->/g, '')

  // 3. Rewrite every opening tag: keep tag name + allowed attrs only.
  out = out.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (full, rawTagName: string, rawAttrs: string) => {
      const tag = rawTagName.toLowerCase()
      if (!ALLOWED_TAGS.has(tag)) {
        // Unknown tag — drop the wrapper, keep the content via outer
        // replace (this regex only matches the opening tag, so dropping
        // here strips just the angle-brackets).
        return ''
      }
      const allowed = ATTR_ALLOWLIST[tag] ?? new Set<string>()
      const keptAttrs = extractAttrs(rawAttrs).filter(([name]) =>
        allowed.has(name.toLowerCase()),
      )
      const attrStr = keptAttrs
        .map(([name, value]) => (value === null ? name : `${name}="${escapeAttr(value)}"`))
        .join(' ')
      return attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`
    },
  )

  // 4. Rewrite closing tags: drop closes for tags we don't allow.
  out = out.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g, (full, rawTagName: string) => {
    const tag = rawTagName.toLowerCase()
    return ALLOWED_TAGS.has(tag) ? `</${tag}>` : ''
  })

  // 5. Collapse runs of whitespace inside the HTML (Outlook web pastes
  // 3+ newlines between every paragraph which makes plain-text noisy).
  out = out.replace(/\n{3,}/g, '\n\n')

  return out
}

/**
 * Extract `name="value"` / `name='value'` / boolean attributes from a
 * tag's raw attribute string. Tolerates Outlook's quirks (unquoted
 * values, tabs/newlines as separators, attributes containing `>` would
 * have broken the outer regex anyway so we don't worry about them).
 */
function extractAttrs(raw: string): Array<[string, string | null]> {
  if (!raw) return []
  const out: Array<[string, string | null]> = []
  // Match: name="value", name='value', name=value, or boolean name
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const name = m[1]
    const value = m[2] ?? m[3] ?? m[4] ?? null
    out.push([name, value])
  }
  return out
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Naive HTML → plain text. Used as the multipart text/plain part on
 * .eml files and when we want to give callers a plain-text view of a
 * sanitised body. NOT identical to AN's own plain-text generator —
 * that's done on AN's side.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  return sanitiseEmailHtml(html)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
