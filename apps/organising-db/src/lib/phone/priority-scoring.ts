import type { SupportLevel } from '@/types/planner-types'

interface PriorityInput {
  support_level?: SupportLevel | string | null
  connection_status?: string | null
  contact_count?: number
  membership_status?: string | null
  has_phone?: boolean
  preferred_contact_method?: string | null
  manual_override?: number | null
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

  if (!input.has_phone) {
    score = 0
  }

  return Math.max(0, Math.min(100, score))
}
