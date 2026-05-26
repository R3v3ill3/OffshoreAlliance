/**
 * BCC pre-send variable analysis.
 *
 * A "Save shared BCC draft" or "Open in mail client (BCC)" dispatch sends
 * a SINGLE shared body to multiple recipients. Per-recipient personalisation
 * tokens (`{{first_name}}`) can't resolve. But many campaign-scoped tokens
 * (`{{employer_name}}`, `{{worksite_name}}`) often have a single deterministic
 * value across the whole list and CAN safely auto-resolve.
 *
 * `analyzeBodyTokens()` walks the body + recipient list and classifies each
 * detected token:
 *
 *   - 'resolvable' — single deterministic value present for all recipients.
 *     Auto-resolve to that value. UI shows it folded under "auto-resolved".
 *   - 'varying'    — recipient-tier token OR campaign-tier token whose value
 *     varies across the selected recipients. UI prompts for collective
 *     phrasing, custom text, removal, or keep-literal.
 *   - 'missing'    — token has no value available (campaign data not filled
 *     in, or no recipient has the field). UI prompts to remove or replace.
 *
 * `applyTokenDecisions()` produces a transformed body string from the user's
 * choices, applying:
 *   - 'auto'        — replace token with the resolved value (resolvable only).
 *   - 'collective'  — replace token with the suggested or custom collective phrase.
 *   - 'custom'      — replace token with user-typed custom text.
 *   - 'remove'      — strip the token (replace with empty string).
 *   - 'keep'        — leave the token literal in the output.
 */

import {
  CAMPAIGN_CONTEXT_VARIABLES,
  RECIPIENT_VARIABLES,
  ALL_TEMPLATE_VARIABLES,
  type TemplateVariable,
} from './template-variables'
import { extractMergeFieldKeys, countMergeFieldOccurrences } from './chip-html'

export interface AnalysedRecipient {
  worker_id: number
  first_name?: string | null
  last_name?: string | null
  occupation?: string | null
  employer_name?: string | null
  worksite_name?: string | null
}

export type TokenKind = 'resolvable' | 'varying' | 'missing'

export interface TokenAnalysis {
  token: string
  label: string
  tier: 'campaign' | 'recipient'
  kind: TokenKind
  /** Distinct non-empty values across the recipient list. */
  distinctValues: string[]
  /** For `resolvable` — the single deterministic value. */
  resolvedValue?: string
  /** Suggested collective phrase, when applicable. */
  suggestedCollective?: string
  /** How many times the token appears in the body. */
  occurrences: number
}

/**
 * Built-in collective fallbacks for recipient-tier tokens. Pluralised so a
 * single shared body reads naturally. Keys NOT in this map fall back to
 * the label (e.g. "occupation" → "workmate").
 */
const COLLECTIVE_DEFAULTS: Record<string, string> = {
  first_name: 'comrades',
  last_name: '',
  occupation: 'workmate',
}

export function analyzeBodyTokens(
  source: string,
  recipients: AnalysedRecipient[],
  campaignContext: Record<string, string | undefined>,
): TokenAnalysis[] {
  const keys = extractMergeFieldKeys(source)
  return keys.map((key) => {
    const meta = ALL_TEMPLATE_VARIABLES.find((v) => v.key === key)
    const label = meta?.label ?? key
    const tier = meta?.tier ?? 'campaign'
    const occurrences = countMergeFieldOccurrences(source, key)
    const distinctValues = collectDistinctValues(key, tier, recipients, campaignContext)

    let kind: TokenKind
    let resolvedValue: string | undefined
    if (tier === 'recipient') {
      if (distinctValues.length === 1 && recipients.length > 0) {
        // Every recipient shares the same value — vanishingly rare for
        // first_name etc. but possible (e.g. all selected workers named
        // 'Maria'). Treat as resolvable to give the user the option.
        kind = 'resolvable'
        resolvedValue = distinctValues[0]
      } else if (distinctValues.length === 0) {
        kind = 'missing'
      } else {
        kind = 'varying'
      }
    } else {
      // Campaign tier — comes from campaignContext (not per-recipient).
      const v = campaignContext[key]
      if (v && v.trim() !== '') {
        kind = 'resolvable'
        resolvedValue = v
      } else {
        kind = 'missing'
      }
    }

    const suggestedCollective =
      tier === 'recipient'
        ? COLLECTIVE_DEFAULTS[key] ?? defaultCollectiveFromLabel(label)
        : undefined

    return {
      token: key,
      label,
      tier,
      kind,
      distinctValues,
      resolvedValue,
      suggestedCollective,
      occurrences,
    }
  })
}

function collectDistinctValues(
  key: string,
  tier: 'campaign' | 'recipient',
  recipients: AnalysedRecipient[],
  campaignContext: Record<string, string | undefined>,
): string[] {
  if (tier === 'campaign') {
    const v = campaignContext[key]
    return v && v.trim() !== '' ? [v] : []
  }
  // Recipient tier — read the matching field off each worker.
  const seen = new Set<string>()
  for (const r of recipients) {
    const raw = recipientValueForKey(r, key)
    if (raw && raw.trim() !== '') seen.add(raw.trim())
  }
  return [...seen]
}

function recipientValueForKey(
  r: AnalysedRecipient,
  key: string,
): string | null | undefined {
  switch (key) {
    case 'first_name':
      return r.first_name
    case 'last_name':
      return r.last_name
    case 'occupation':
      return r.occupation
    case 'employer_name':
      return r.employer_name
    case 'worksite_name':
      return r.worksite_name
    default:
      return null
  }
}

function defaultCollectiveFromLabel(label: string): string {
  const lower = label.toLowerCase()
  if (lower.includes('name')) return 'comrades'
  return lower
}

export type TokenDecision =
  | { kind: 'auto' }
  | { kind: 'collective'; value?: string }
  | { kind: 'custom'; value: string }
  | { kind: 'remove' }
  | { kind: 'keep' }

/**
 * Produce the default decision for a token based on its analysed kind.
 * The UI seeds each row with this, then lets the user override.
 */
export function defaultDecision(analysis: TokenAnalysis): TokenDecision {
  if (analysis.kind === 'resolvable') return { kind: 'auto' }
  if (analysis.kind === 'varying' && analysis.suggestedCollective != null) {
    return { kind: 'collective', value: analysis.suggestedCollective }
  }
  if (analysis.kind === 'missing') return { kind: 'remove' }
  return { kind: 'keep' }
}

/**
 * Apply user decisions to the body — replaces each token's chip span AND
 * raw `{{key}}` occurrence with the chosen substitution.
 */
export function applyTokenDecisions(
  source: string,
  analyses: TokenAnalysis[],
  decisions: Record<string, TokenDecision>,
): string {
  let out = source
  for (const a of analyses) {
    const decision = decisions[a.token] ?? defaultDecision(a)
    const replacement = resolveDecision(a, decision)
    if (replacement === null) continue // 'keep' — no substitution
    out = replaceToken(out, a.token, replacement)
  }
  return out
}

function resolveDecision(
  a: TokenAnalysis,
  d: TokenDecision,
): string | null {
  switch (d.kind) {
    case 'auto':
      return a.resolvedValue ?? a.distinctValues[0] ?? ''
    case 'collective':
      return d.value ?? a.suggestedCollective ?? ''
    case 'custom':
      return d.value
    case 'remove':
      return ''
    case 'keep':
      return null
  }
}

function replaceToken(source: string, key: string, replacement: string): string {
  if (!source) return source
  const escaped = escapeRegExp(key)
  // Replace chip spans first to avoid orphaning the inner {{key}} text.
  let out = source.replace(
    new RegExp(
      `<span\\b[^>]*?\\bdata-merge-field=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/span>`,
      'gi',
    ),
    escapeHtml(replacement),
  )
  // Then any remaining raw tokens.
  out = out.replace(
    new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'g'),
    escapeHtml(replacement),
  )
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Re-export the variable lists so the dialog can render labels by tier.
export { CAMPAIGN_CONTEXT_VARIABLES, RECIPIENT_VARIABLES }
export type { TemplateVariable }
