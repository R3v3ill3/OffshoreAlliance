export const RATING_CHART_COLORS: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: '#a1a1aa', // zinc-400  — Unassessed
  1: '#0284c7', // sky-600   — Supportive Leader
  2: '#059669', // emerald-600 — Supporter
  3: '#d97706', // amber-600 — Neutral
  4: '#dc2626', // red-600   — Opposed
  5: '#991b1b', // red-800   — Oppositional Leader
}

export const RATING_LABELS: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: 'Unassessed',
  1: 'Supportive Leader',
  2: 'Supporter',
  3: 'Neutral',
  4: 'Opposed',
  5: 'Oppositional Leader',
}

export const RATING_SHORT_LABELS: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: 'Unassessed',
  1: '1-Leader',
  2: '2-Supporter',
  3: '3-Neutral',
  4: '4-Opposed',
  5: '5-Opp.Leader',
}

/** Display order: supportive ratings first, unassessed last. */
export const RATING_DISPLAY_ORDER = [1, 2, 3, 4, 5, 0] as const
export type RatingValue = 0 | 1 | 2 | 3 | 4 | 5
