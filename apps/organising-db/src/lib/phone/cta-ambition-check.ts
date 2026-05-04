/**
 * Pure helpers for the pre-finalise CTA ambition gate.
 *
 * Kept logic-only and dependency-free so it is easily unit-testable.
 */

import type { CallCtaAmbition, CtaSupportLevel } from '@/components/phone/setup/types'
import type { CtaResponse, SupportLevel } from '@/types/planner-types'

// ─── Support level ordering (ascending confidence) ───────────────────────────

export const supportLevelOrder: CtaSupportLevel[] = [
  'hostile',
  'unsupportive',
  'neutral',
  'supporter',
  'strong_supporter',
]

// ─── Call state snapshot passed in from the runner ────────────────────────────

export interface CallStateForAmbitionCheck {
  ctaResponse: CtaResponse | null
  supportLevel: SupportLevel | null
  callDisposition: string | null
}

// ─── Single-ambition check ────────────────────────────────────────────────────

function checkSingleAmbition(
  ambition: CallCtaAmbition,
  callState: CallStateForAmbitionCheck
): boolean {
  // target_response: accepted always counts; otherwise exact match
  if (ambition.target_response != null) {
    const { ctaResponse } = callState
    if (!ctaResponse) return false
    return ctaResponse === 'accepted' || ctaResponse === ambition.target_response
  }

  // target_support_level: actual must be >= required level in the order list
  if (ambition.target_support_level != null) {
    const { supportLevel } = callState
    if (!supportLevel) return false
    const required = supportLevelOrder.indexOf(ambition.target_support_level)
    const actual = supportLevelOrder.indexOf(supportLevel as CtaSupportLevel)
    return actual >= required
  }

  // target_binary: approximate as "any call disposition was recorded"
  if (ambition.target_binary != null) {
    return !!callState.callDisposition
  }

  return false
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when the current call state meets (or exceeds) at least one
 * configured CTA ambition target.
 *
 * If no ambitions are configured, or none have targetable fields set, returns
 * true (nothing to gate on).
 */
export function meetsCtaAmbition(
  ambitions: CallCtaAmbition[],
  callState: CallStateForAmbitionCheck
): boolean {
  if (ambitions.length === 0) return true

  const applicable = ambitions.filter(
    (a) => a.target_response != null || a.target_support_level != null || a.target_binary != null
  )

  if (applicable.length === 0) return true

  return applicable.some((a) => checkSingleAmbition(a, callState))
}
