import { areAmbitionsStepMetricComplete, type AmbitionMetricRow } from '@/lib/planning/ambition-metric-status'

export type P2wTabId = 'ambitions' | 'where-to-play' | 'theory' | 'capacities' | 'management'

export type P2wStepOverride = 'auto' | 'force-complete' | 'force-incomplete'

export const P2W_TAB_ORDER: P2wTabId[] = [
  'ambitions',
  'where-to-play',
  'theory',
  'capacities',
  'management',
]

export type P2wStepCompletionInput = {
  ambitions: AmbitionMetricRow[]
  whereToPlayLength: number
  currentTheory: { if_then_statement: string | null } | null
  capacitiesLength: number
  managementSystemsLength: number
}

export function computeP2wAutoComplete(tab: P2wTabId, input: P2wStepCompletionInput): boolean {
  switch (tab) {
    case 'ambitions':
      return areAmbitionsStepMetricComplete(input.ambitions)
    case 'where-to-play':
      return input.whereToPlayLength > 0
    case 'theory':
      return !!input.currentTheory?.if_then_statement?.trim()
    case 'capacities':
      return input.capacitiesLength > 0
    case 'management':
      return input.managementSystemsLength > 0
    default:
      return false
  }
}

export function effectiveStepComplete(
  tab: P2wTabId,
  input: P2wStepCompletionInput,
  override: P2wStepOverride | undefined
): boolean {
  if (override === 'force-complete') return true
  if (override === 'force-incomplete') return false
  return computeP2wAutoComplete(tab, input)
}
