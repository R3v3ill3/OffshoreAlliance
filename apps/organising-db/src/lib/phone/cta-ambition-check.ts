/**
 * Pure helpers for the pre-finalise CTA ambition gate.
 *
 * Kept logic-only and dependency-free so it is easily unit-testable.
 *
 * The gate now consumes per-CTA ratings (one rating per ambition row)
 * instead of the legacy single CtaResponse select. An ambition is
 * considered "met" when:
 *
 *   - target_min_rating is set: the captured rating <= target (lower is
 *     more supportive on the 1..5 scale, where 1 = supportive_leader).
 *   - target_binary is set: any non-null binary_value implies the
 *     organiser captured an answer for this CTA.
 *   - target_support_level is set (legacy): falls back to the SupportLevel
 *     pulled from the call form.
 *
 * If no ambitions are configured, or none have any targetable fields,
 * returns true (nothing to gate on).
 */

import type { CallCtaAmbition, CtaSupportLevel } from '@/components/phone/setup/types'
import type { SupportLevel } from '@/types/planner-types'

// ─── Support level ordering (ascending confidence) ───────────────────────────

export const supportLevelOrder: CtaSupportLevel[] = [
  'hostile',
  'unsupportive',
  'neutral',
  'supporter',
  'strong_supporter',
]

// ─── Per-CTA rating snapshot the runner passes in ────────────────────────────

export interface CtaRatingSnapshot {
  /** 1..5; null if only binary_value was set. */
  rating: number | null
  /** yes / no / unsure / abstain; null if only rating was set. */
  binary_value: string | null
}

// ─── Call state snapshot passed in from the runner ────────────────────────────

export interface CallStateForAmbitionCheck {
  /** Map<cta_ambition_id, snapshot> of captured per-CTA ratings. */
  ctaRatings: Map<number, CtaRatingSnapshot>
  /** Legacy form-level support level select; still used when an ambition targets it. */
  supportLevel: SupportLevel | null
}

// ─── Single-ambition check ────────────────────────────────────────────────────

function checkSingleAmbition(
  ambition: CallCtaAmbition,
  callState: CallStateForAmbitionCheck
): boolean {
  const ambitionId = ambition.id
  const snapshot = ambitionId != null ? callState.ctaRatings.get(ambitionId) : undefined

  // Per-CTA rating-based targets — preferred path.
  if (ambition.target_min_rating != null) {
    if (!snapshot || snapshot.rating == null) return false
    // Lower number is more supportive on the 1..5 scale (1 = supportive
    // leader). "Meets target" means actual <= configured minimum.
    return snapshot.rating <= ambition.target_min_rating
  }

  if (ambition.target_binary != null) {
    if (!snapshot || snapshot.binary_value == null) return false
    return true
  }

  // Form-level support level fallback (legacy targeting).
  if (ambition.target_support_level != null) {
    const { supportLevel } = callState
    if (!supportLevel) return false
    const required = supportLevelOrder.indexOf(ambition.target_support_level)
    const actual = supportLevelOrder.indexOf(supportLevel as CtaSupportLevel)
    return actual >= required
  }

  // target_response is no longer used directly: it has been replaced by the
  // per-CTA rating capture above. An ambition that *only* sets
  // target_response is treated as having no actionable target on the new
  // UI, and is filtered out by the caller via `hasActionableTarget`.
  return false
}

function hasActionableTarget(a: CallCtaAmbition): boolean {
  return (
    a.target_min_rating != null ||
    a.target_binary != null ||
    a.target_support_level != null
  )
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

  const applicable = ambitions.filter(hasActionableTarget)

  if (applicable.length === 0) return true

  return applicable.some((a) => checkSingleAmbition(a, callState))
}
