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

/** Default stage durations in weeks (ratios for proportional scaling). */
export const DEFAULT_STAGE_DURATION_WEEKS: Record<number, number> = {
  1: 6,
  2: 6,
  3: 8,
  4: 6,
  5: 4,
  6: 16,
}

const DEFAULT_STAGE_DURATIONS = DEFAULT_STAGE_DURATION_WEEKS

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

function atNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00`)
}

/**
 * Lay out all six stages between start and end (inclusive calendar days),
 * with each stage's length proportional to DEFAULT_STAGE_DURATION_WEEKS.
 * Remainder days after flooring are assigned to stage 6.
 */
export function calculateProportionalTimeline(
  windowStart: Date,
  windowEnd: Date,
  weights: Record<number, number> = DEFAULT_STAGE_DURATION_WEEKS
): StageDateRange[] {
  const start = windowStart
  const end = windowEnd
  if (differenceInDays(end, start) < 0) {
    return calculateForwardsTimeline(start, weights)
  }

  const totalDays = Math.max(6, differenceInDays(end, start) + 1)
  const stageNums = [1, 2, 3, 4, 5, 6] as const
  const w = stageNums.map((n) => weights[n] ?? 6)
  const sumW = w.reduce((a, b) => a + b, 0)

  const dayCounts = w.map((wi) => Math.floor((totalDays * wi) / sumW))
  let used = dayCounts.reduce((a, b) => a + b, 0)
  dayCounts[5] += totalDays - used

  for (let i = 0; i < 6; i++) {
    if (dayCounts[i] < 1) {
      const deficit = 1 - dayCounts[i]
      dayCounts[i] = 1
      dayCounts[5] = Math.max(1, dayCounts[5] - deficit)
    }
  }

  const stages: StageDateRange[] = []
  let cursor = start
  for (let i = 0; i < 6; i++) {
    const d = dayCounts[i]
    const stageStart = cursor
    const stageEnd = addDays(cursor, d - 1)
    stages.push({
      stage_number: stageNums[i],
      planned_start: stageStart,
      planned_end: stageEnd,
      duration_weeks: Math.round((d / 7) * 10) / 10,
    })
    cursor = addDays(stageEnd, 1)
  }

  return stages
}

/**
 * Keep the first `completedCount` stages as in `initial`; re-allocate stages
 * completedCount+1..6 from the day after the last completed stage.
 * If `campaignEndYmd` is set, scale remaining stages proportionally into that window; otherwise use default week lengths.
 */
export function redistributeAfterCompletedPrefix(
  initial: StageDateRange[],
  completedCount: number,
  campaignEndYmd: string | null,
  weights: Record<number, number> = DEFAULT_STAGE_DURATION_WEEKS
): StageDateRange[] {
  if (completedCount <= 0 || initial.length < 6) {
    return initial.map((s) => ({ ...s }))
  }

  const k = Math.min(completedCount, 5)
  const prefix = initial.slice(0, k).map((s) => ({
    ...s,
    planned_start: new Date(s.planned_start),
    planned_end: new Date(s.planned_end),
  }))

  const lastEnd = prefix[k - 1].planned_end
  const nextStart = addDays(lastEnd, 1)
  const remainingStages: number[] = []
  for (let n = k + 1; n <= 6; n++) remainingStages.push(n)

  if (remainingStages.length === 0) return prefix

  if (campaignEndYmd) {
    const end = atNoon(campaignEndYmd)
    let totalDays = differenceInDays(end, nextStart) + 1
    if (totalDays < remainingStages.length) totalDays = remainingStages.length

    const w = remainingStages.map((n) => weights[n] ?? 6)
    const sumW = w.reduce((a, b) => a + b, 0)
    const dayCounts = w.map((wi) => Math.floor((totalDays * wi) / sumW))
    let used = dayCounts.reduce((a, b) => a + b, 0)
    dayCounts[dayCounts.length - 1] += totalDays - used

    for (let i = 0; i < dayCounts.length; i++) {
      if (dayCounts[i] < 1) {
        const deficit = 1 - dayCounts[i]
        dayCounts[i] = 1
        const last = dayCounts.length - 1
        dayCounts[last] = Math.max(1, dayCounts[last] - deficit)
      }
    }

    const tail: StageDateRange[] = []
    let cursor = nextStart
    for (let i = 0; i < remainingStages.length; i++) {
      const sn = remainingStages[i]
      const d = dayCounts[i]
      const stageStart = cursor
      const stageEnd = addDays(cursor, d - 1)
      tail.push({
        stage_number: sn,
        planned_start: stageStart,
        planned_end: stageEnd,
        duration_weeks: Math.round((d / 7) * 10) / 10,
      })
      cursor = addDays(stageEnd, 1)
    }
    return [...prefix, ...tail]
  }

  let cursor = nextStart
  const tail: StageDateRange[] = []
  for (const sn of remainingStages) {
    const dur = weights[sn] ?? 6
    const stageStart = cursor
    const stageEnd = addWeeks(cursor, dur)
    tail.push({
      stage_number: sn,
      planned_start: stageStart,
      planned_end: stageEnd,
      duration_weeks: dur,
    })
    cursor = stageEnd
  }
  return [...prefix, ...tail]
}

export type BuildInitialTimelineOpts = {
  linkedStart?: string | null
  linkedEnd?: string | null
  agreementExpiry?: string | null
}

/**
 * Precedence: linked start+end → proportional; linked start only → forwards;
 * agreement expiry → backwards from PABO; else forwards from today.
 */
export function buildInitialStageTimeline(opts: BuildInitialTimelineOpts): StageDateRange[] {
  const { linkedStart, linkedEnd, agreementExpiry } = opts

  if (linkedStart && linkedEnd) {
    return calculateProportionalTimeline(atNoon(linkedStart), atNoon(linkedEnd))
  }
  if (linkedStart) {
    return calculateForwardsTimeline(atNoon(linkedStart))
  }
  if (agreementExpiry) {
    const paboDate = subDays(atNoon(agreementExpiry), 30)
    return calculateBackwardsTimeline(paboDate)
  }
  return calculateForwardsTimeline(new Date())
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
