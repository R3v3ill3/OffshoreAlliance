export interface PriorityOrder {
  by: 'assessment_rating' | 'rating' | 'sequential'
  /**
   * Ordered bucket keys. For `assessment_rating`, valid keys are
   * '1' | '2' | '3' | '4' | '5' | 'unassessed' for numeric assessments, or
   * 'true' | 'false' | 'unassessed' for binary assessments. For `rating`,
   * keys are '1' | '2' | '3' | '4' | '5' | 'unrated' (rounded cumulative).
   */
  order?: string[]
  /** Required when by='assessment_rating' — tells the scorer which assessment to consult per worker. */
  assessment_id?: number
}

interface PriorityInput {
  connection_status?: string | null
  contact_count?: number
  membership_status?: string | null
  has_phone?: boolean
  preferred_contact_method?: string | null
  manual_override?: number | null
  cumulative_rating?: number | null
  /**
   * When priority_order.by === 'assessment_rating', supply the bucket key the
   * worker maps into for the selected assessment. '1'…'5', 'true', 'false',
   * or 'unassessed'. When not relevant, leave undefined.
   */
  assessment_rating_bucket?: string | null
  priority_order?: PriorityOrder | null
}

const STATUS_SCORES: Record<string, number> = {
  potential: 25,
  contacted: 20,
  engaged: 15,
  member: 10,
  inactive: 5,
  lost: 2,
}

/**
 * Computes a priority score (0–100 base + group bonus).
 *
 * When `priority_order` is supplied, a group bonus of (order.length - groupIndex) * 300
 * is added to ensure the desired bucket ordering dominates over the individual score.
 * Workers whose rating is not in the specified order array get a group bonus of 0
 * and are called last within their priority strategy.
 */
export function computePriorityScore(input: PriorityInput): number {
  if (input.manual_override != null) return input.manual_override

  let score = 50

  if (input.connection_status && STATUS_SCORES[input.connection_status] != null) {
    score += STATUS_SCORES[input.connection_status]
  }

  if (input.membership_status === 'non_member') {
    score += 10
  }

  if (input.preferred_contact_method === 'phone') {
    score += 15
  }

  const contacts = input.contact_count ?? 0
  if (contacts === 0) {
    score += 20
  } else if (contacts <= 2) {
    score += 10
  }

  if (input.cumulative_rating != null) {
    score += Math.min(input.cumulative_rating * 2, 20)
  }

  if (!input.has_phone) {
    score = 0
  }

  score = Math.max(0, Math.min(100, score))

  // Apply group ordering bonus — ensures bucket order dominates individual score
  if (
    input.priority_order &&
    input.priority_order.by !== 'sequential' &&
    input.priority_order.order &&
    input.priority_order.order.length > 0
  ) {
    const { by, order } = input.priority_order
    let groupKey: string | null = null

    if (by === 'assessment_rating') {
      // null/missing assessment rating maps to 'unassessed'
      groupKey = input.assessment_rating_bucket || 'unassessed'
    } else if (by === 'rating') {
      // null/missing cumulative rating maps to 'unrated'
      groupKey =
        input.cumulative_rating != null
          ? String(Math.round(input.cumulative_rating))
          : 'unrated'
    }

    if (groupKey) {
      const groupIndex = order.indexOf(groupKey)
      if (groupIndex !== -1) {
        score += (order.length - groupIndex) * 300
      }
    }
  }

  return score
}
