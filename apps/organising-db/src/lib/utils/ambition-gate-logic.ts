import type { MetricType, PlanAmbition } from '@/types/planner-types'

/** Joined shape used on stage plan + gate assessment */
export type PlanAmbitionWithOption = PlanAmbition & {
  ambition_options?: {
    option_text: string
    category: string
    has_variable: boolean | null
    variable_label: string | null
    variable_type: string | null
  } | null
}

function resolveMetricType(ambition: PlanAmbitionWithOption): MetricType {
  const row = ambition.metric_type as MetricType | null | undefined
  if (row && ['percentage', 'count', 'boolean', 'date', 'range', 'text'].includes(row)) {
    return row
  }
  const vt = ambition.ambition_options?.variable_type
  if (vt === 'percentage') return 'percentage'
  if (vt === 'number') return 'count'
  if (vt === 'date') return 'date'
  if (vt === 'text') return 'text'
  if (ambition.target_value_max) return 'range'
  return 'boolean'
}

export function ambitionDisplayName(ambition: PlanAmbitionWithOption): string {
  if (ambition.custom_text) return ambition.custom_text
  return ambition.ambition_options?.option_text?.replace('{target_value}', ambition.target_value || '…') || 'Ambition'
}

/** Met when numeric/string target is satisfied; date-only rows use target_date vs today */
export function evaluatePlanAmbition(ambition: PlanAmbitionWithOption): boolean {
  const metric = resolveMetricType(ambition)

  if (metric === 'boolean') {
    if (ambition.current_value != null && ambition.current_value !== '') {
      return ambition.current_value.toLowerCase() === 'true'
    }
    return ambition.is_achieved === true
  }

  if (metric === 'date') {
    if (!ambition.target_date) return false
    const ref = ambition.current_value || formatTodayYmd()
    const t = new Date(ambition.target_date)
    const c = new Date(ref)
    return !isNaN(t.getTime()) && !isNaN(c.getTime()) && c <= t
  }

  if (metric === 'range') {
    const min = parseFloat(ambition.target_value || '')
    const max = parseFloat(ambition.target_value_max || '')
    const cur = parseFloat(ambition.current_value || '')
    if (isNaN(min) || isNaN(max) || isNaN(cur)) return false
    return cur >= min && cur <= max
  }

  if (metric === 'percentage' || metric === 'count') {
    if (!ambition.target_value?.trim()) return false
    const target = metric === 'percentage' ? parseFloat(ambition.target_value) : parseInt(ambition.target_value, 10)
    const current = metric === 'percentage' ? parseFloat(ambition.current_value || '') : parseInt(ambition.current_value || '', 10)
    if (isNaN(target)) return false
    if (isNaN(current)) return false
    return current >= target
  }

  if (metric === 'text') {
    if (!ambition.target_value?.trim()) return false
    return (ambition.current_value || '').trim().length > 0
  }

  return false
}

function formatTodayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function evaluateAmbitions(ambitions: PlanAmbitionWithOption[]): {
  allMet: boolean
  hardGatesMet: boolean
  metCount: number
  totalCount: number
  failedHardGates: PlanAmbitionWithOption[]
  failedSoftGates: PlanAmbitionWithOption[]
} {
  const withMet = ambitions.map((a) => ({
    ...a,
    is_met: evaluatePlanAmbition(a),
  }))

  const metCount = withMet.filter((e) => e.is_met).length
  const failedHardGates = withMet.filter((e) => !e.is_met && e.is_hard_gate)
  const failedSoftGates = withMet.filter((e) => !e.is_met && !e.is_hard_gate)

  return {
    allMet: withMet.every((e) => e.is_met),
    hardGatesMet: failedHardGates.length === 0,
    metCount,
    totalCount: ambitions.length,
    failedHardGates,
    failedSoftGates,
  }
}

export function formatAmbitionMetricValue(
  value: string | null,
  metric: MetricType
): string {
  if (!value) return '—'
  switch (metric) {
    case 'percentage':
      return `${value}%`
    case 'count':
    case 'range':
      return value
    case 'boolean':
      return value.toLowerCase() === 'true' ? 'Yes' : 'No'
    case 'date':
      return new Date(value).toLocaleDateString('en-AU')
    default:
      return value
  }
}

export { resolveMetricType }
