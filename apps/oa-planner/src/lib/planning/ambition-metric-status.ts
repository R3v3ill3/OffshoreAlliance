/**
 * Soft completeness checks for ambition metric fields (UI nudges only — not validation gates).
 */

export type AmbitionMetricRow = {
  ambition_option_id: number | null
  metric_type?: string | null
  target_value: string | null
  target_value_max?: string | null
  ambition_options?: {
    has_variable: boolean | null
    variable_type?: string | null
  } | null
}

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0
}

export function isAmbitionMetricIncomplete(a: AmbitionMetricRow): boolean {
  const isCustom = a.ambition_option_id == null
  const opt = a.ambition_options

  if (isCustom) {
    const m = a.metric_type || ''
    if (m === 'boolean' || m === 'text') return false
    if (m === 'range') {
      return !nonEmpty(a.target_value) || !nonEmpty(a.target_value_max)
    }
    return !nonEmpty(a.target_value)
  }

  if (opt?.has_variable) {
    return !nonEmpty(a.target_value)
  }

  return false
}

/** Step completion: at least one ambition and every row has required metric fields filled. */
export function areAmbitionsStepMetricComplete(ambitions: AmbitionMetricRow[]): boolean {
  if (ambitions.length === 0) return false
  return ambitions.every((a) => !isAmbitionMetricIncomplete(a))
}
