import type { SupportLevel } from '@/types/planner-types'

export interface PriorityOrder {
  by: 'support_level' | 'rating' | 'sequential'
  /** Ordered array of support_level values or stringified rating integers, e.g. ['strong_supporter', 'neutral'] or ['1', '3', '2'] */
  order?: string[]
}

interface PriorityInput {
  support_level?: SupportLevel | string | null
  connection_status?: string | null
  contact_count?: number
  membership_status?: string | null
  has_phone?: boolean
  preferred_contact_method?: string | null
  manual_override?: number | null
  cumulative_rating?: number | null
  priority_order?: PriorityOrder | null
}

const SUPPORT_SCORES: Record<string, number> = {
  strong_supporter: 5,
  supporter: 15,
  neutral: 30,
  unsupportive: 10,
  hostile: 2,
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
 * Workers whose support_level (or rating) is not in the specified order array get
 * a group bonus of 0 and are called last within their priority strategy.
 */
export function computePriorityScore(input: PriorityInput): number {
  if (input.manual_override != null) return input.manual_override

  let score = 50

  if (input.support_level && SUPPORT_SCORES[input.support_level] != null) {
    score += SUPPORT_SCORES[input.support_level]
  }

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
  if (input.priority_order && input.priority_order.by !== 'sequential' && input.priority_order.order && input.priority_order.order.length > 0) {
    const { by, order } = input.priority_order
    let groupKey: string | null = null

    if (by === 'support_level' && input.support_level) {
      groupKey = input.support_level
    } else if (by === 'rating' && input.cumulative_rating != null) {
      groupKey = String(Math.round(input.cumulative_rating))
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
