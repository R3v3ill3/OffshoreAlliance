/**
 * Pure-string transforms for merge-field chip HTML.
 *
 * Extracted from the TipTap mention extension so server code can import
 * these without dragging in editor dependencies.
 *
 * The TipTap MergeFieldMention extension serialises merge tokens as
 * `<span data-merge-field="key" class="merge-field-chip">{{key}}</span>`
 * (or similar — attribute order may vary). The pipeline is:
 *
 *   1. User inserts a mention → editor doc has a `mergeField` node.
 *   2. On editor change, `editor.getHTML()` emits chip spans.
 *   3. `stripMergeFieldChips()` rewrites them to bare `{{key}}` text BEFORE
 *      DOMPurify sanitises (so the sanitiser's allowlist doesn't have to
 *      know about `data-merge-field`).
 *   4. Result is persisted to `campaign_comms_drafts.body_html`.
 *   5. Server-side resolvers (`resolveScriptVariables`,
 *      `resolveTemplateVariables`, `translateToActionNetwork`) operate on
 *      the bare `{{key}}` tokens.
 *
 * On load, `parseHtmlWithMergeFields()` does the reverse — finds raw
 * `{{key}}` tokens in stored HTML and wraps them as `<span data-merge-field>`
 * so TipTap's parseHTML rule re-hydrates them as MergeFieldMention nodes.
 */

import { ALL_VARIABLE_KEYS } from './template-variables'

/**
 * Remove chip wrappers from exported HTML, leaving raw `{{key}}` tokens
 * for downstream resolvers.
 *
 * Matches any `<span ... data-merge-field="key" ...>...</span>` regardless of
 * attribute order. The non-greedy `[\s\S]*?` body match handles the chip's
 * inner text (which is itself `{{key}}` by convention but may legally
 * contain the human-readable label in older drafts).
 */
export function stripMergeFieldChips(html: string): string {
  if (!html) return html
  return html.replace(
    /<span\b[^>]*?\bdata-merge-field=["']([^"']+)["'][^>]*>[\s\S]*?<\/span>/gi,
    (_, key) => `{{${key}}}`,
  )
}

/**
 * Rewrite raw `{{key}}` tokens in an HTML string into chip markup so
 * TipTap can hydrate them as MergeFieldMention nodes via parseHTML.
 * Skips tokens whose key isn't a known merge variable.
 */
export function parseHtmlWithMergeFields(html: string): string {
  if (!html) return html
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, rawKey) => {
    const key = String(rawKey)
    if (!ALL_VARIABLE_KEYS.includes(key)) return full
    return `<span data-merge-field="${key}">{{${key}}}</span>`
  })
}

/**
 * Convert plain text containing `{{key}}` tokens into HTML where each
 * known token is wrapped as a chip span — used when initialising the
 * editor from a draft that only has plain text persisted.
 */
export function plainTextToChipHtml(text: string): string {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withChips = escaped.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, rawKey) => {
    const key = String(rawKey)
    if (!ALL_VARIABLE_KEYS.includes(key)) return full
    return `<span data-merge-field="${key}">{{${key}}}</span>`
  })
  return withChips
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Return the set of known merge-variable keys present in the source
 * text or HTML — covers both bare `{{key}}` tokens AND `<span data-merge-field="key">`
 * chip spans. Deduplicates; unknown keys ignored.
 */
export function extractMergeFieldKeys(source: string): string[] {
  if (!source) return []
  const seen = new Set<string>()
  // Raw tokens.
  for (const m of source.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (ALL_VARIABLE_KEYS.includes(m[1])) seen.add(m[1])
  }
  // Chip spans (in case strip didn't run before this).
  for (const m of source.matchAll(
    /<span\b[^>]*?\bdata-merge-field=["']([^"']+)["']/gi,
  )) {
    if (ALL_VARIABLE_KEYS.includes(m[1])) seen.add(m[1])
  }
  return [...seen]
}

/**
 * Count occurrences of a specific merge key in source (raw tokens + chip
 * spans). Useful for "{{first_name}} appears 3 times in this draft" UI.
 */
export function countMergeFieldOccurrences(source: string, key: string): number {
  if (!source || !key) return 0
  const rawMatches = source.match(
    new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g'),
  )
  const chipMatches = source.match(
    new RegExp(
      `<span\\b[^>]*?\\bdata-merge-field=["']${escapeRegExp(key)}["']`,
      'gi',
    ),
  )
  return (rawMatches?.length ?? 0) + (chipMatches?.length ?? 0)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
