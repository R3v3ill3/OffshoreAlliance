import type { GateCriterion, MetricType } from '@/types'

export interface CriterionEvaluation {
  criterion_id: number
  criterion_name: string
  target_value: string
  current_value: string | null
  is_met: boolean
  is_hard_gate: boolean
  metric_type: MetricType
}

export function evaluateCriterion(criterion: GateCriterion): boolean {
  const { metric_type, target_value, current_value } = criterion

  if (!current_value) return false

  switch (metric_type as MetricType) {
    case 'percentage': {
      const target = parseFloat(target_value)
      const current = parseFloat(current_value)
      return !isNaN(target) && !isNaN(current) && current >= target
    }
    case 'count': {
      const target = parseInt(target_value, 10)
      const current = parseInt(current_value, 10)
      return !isNaN(target) && !isNaN(current) && current >= target
    }
    case 'boolean': {
      return current_value.toLowerCase() === 'true'
    }
    case 'date': {
      const targetDate = new Date(target_value)
      const currentDate = new Date(current_value)
      return !isNaN(targetDate.getTime()) && !isNaN(currentDate.getTime()) && currentDate <= targetDate
    }
    default:
      return false
  }
}

export function evaluateGate(criteria: GateCriterion[]): {
  allMet: boolean
  hardGatesMet: boolean
  metCount: number
  totalCount: number
  failedHardGates: GateCriterion[]
  failedSoftGates: GateCriterion[]
} {
  const evaluations = criteria.map((c) => ({
    ...c,
    is_met: evaluateCriterion(c),
  }))

  const metCount = evaluations.filter((e) => e.is_met).length
  const failedHardGates = evaluations.filter((e) => !e.is_met && e.is_hard_gate)
  const failedSoftGates = evaluations.filter((e) => !e.is_met && !e.is_hard_gate)

  return {
    allMet: evaluations.every((e) => e.is_met),
    hardGatesMet: failedHardGates.length === 0,
    metCount,
    totalCount: criteria.length,
    failedHardGates,
    failedSoftGates,
  }
}

export function getGateStatusColor(evaluation: ReturnType<typeof evaluateGate>): 'green' | 'amber' | 'red' | 'grey' {
  if (evaluation.allMet) return 'green'
  if (!evaluation.hardGatesMet) return 'red'
  return 'amber'
}

export function formatMetricValue(value: string | null, metricType: MetricType): string {
  if (!value) return '—'
  switch (metricType) {
    case 'percentage':
      return `${value}%`
    case 'count':
      return value
    case 'boolean':
      return value.toLowerCase() === 'true' ? 'Yes' : 'No'
    case 'date':
      return new Date(value).toLocaleDateString('en-AU')
    default:
      return value
  }
}
