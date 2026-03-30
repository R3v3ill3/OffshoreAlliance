import { addDays, subDays, differenceInDays, differenceInWeeks, addWeeks, format } from 'date-fns'

export function calculatePaboDate(expiryDate: Date): Date {
  return subDays(expiryDate, 30)
}

export function daysUntilExpiry(expiryDate: Date): number {
  return differenceInDays(expiryDate, new Date())
}

export function daysUntilPabo(expiryDate: Date): number {
  return differenceInDays(calculatePaboDate(expiryDate), new Date())
}

export function getExpiryStatus(expiryDate: Date | null): 'green' | 'amber' | 'red' | 'none' {
  if (!expiryDate) return 'none'
  const days = daysUntilExpiry(expiryDate)
  if (days > 365) return 'green'
  if (days > 180) return 'amber'
  return 'red'
}

// Default stage durations in weeks for each stage
const DEFAULT_STAGE_DURATIONS: Record<number, number> = {
  1: 6,
  2: 6,
  3: 8,
  4: 6,
  5: 4,
  6: 16,
}

export interface StageDateRange {
  stage_number: number
  planned_start: Date
  planned_end: Date
  duration_weeks: number
}

/**
 * Calculate stage dates working BACKWARDS from a PABO date
 * Stages 1-5 are calculated backward from PABO, stage 6 starts at PABO
 */
export function calculateBackwardsTimeline(
  paboDate: Date,
  customDurations?: Partial<Record<number, number>>
): StageDateRange[] {
  const durations = { ...DEFAULT_STAGE_DURATIONS, ...customDurations }
  const stages: StageDateRange[] = []

  // Stage 6 starts at PABO
  const stage6Start = paboDate
  const dur6 = durations[6] ?? 16
  const stage6End = addWeeks(stage6Start, dur6)
  stages.unshift({
    stage_number: 6,
    planned_start: stage6Start,
    planned_end: stage6End,
    duration_weeks: dur6,
  })

  // Stages 5..1 work backwards from PABO
  let currentEnd = paboDate
  for (let stage = 5; stage >= 1; stage--) {
    const dur = durations[stage] ?? 6
    const stageEnd = currentEnd
    const stageStart = subDays(addDays(stageEnd, -dur * 7), 0)
    stages.unshift({
      stage_number: stage,
      planned_start: stageStart,
      planned_end: stageEnd,
      duration_weeks: dur,
    })
    currentEnd = stageStart
  }

  return stages
}

/**
 * Calculate stage dates working FORWARDS from a start date
 */
export function calculateForwardsTimeline(
  startDate: Date,
  customDurations?: Partial<Record<number, number>>
): StageDateRange[] {
  const durations = { ...DEFAULT_STAGE_DURATIONS, ...customDurations }
  const stages: StageDateRange[] = []

  let currentStart = startDate
  for (let stage = 1; stage <= 6; stage++) {
    const dur = durations[stage] ?? (stage === 6 ? 16 : 6)
    const stageEnd = addWeeks(currentStart, dur)
    stages.push({
      stage_number: stage,
      planned_start: currentStart,
      planned_end: stageEnd,
      duration_weeks: dur,
    })
    currentStart = stageEnd
  }

  return stages
}

export function calculateVarianceDays(
  plannedDate: Date | null,
  actualDate: Date | null
): number {
  if (!plannedDate || !actualDate) return 0
  return differenceInDays(actualDate, plannedDate)
}

export function formatWeeksUntil(targetDate: Date): string {
  const weeks = differenceInWeeks(targetDate, new Date())
  if (weeks <= 0) return 'Overdue'
  if (weeks === 1) return '1 week'
  return `${weeks} weeks`
}

export function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start) return 'Not set'
  if (!end) return format(start, 'dd MMM yyyy')
  return `${format(start, 'dd MMM yyyy')} – ${format(end, 'dd MMM yyyy')}`
}
