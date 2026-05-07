'use client'

import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { AlertTriangle, Calendar, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  SECTION_PLAN_TIMEFRAME_KIND_LABELS,
  type SectionPlanRow,
  type SectionPlanTimeframeKind,
} from '@/types/section-planning'

const STYLES: Record<
  SectionPlanTimeframeKind,
  {
    bg: string
    border: string
    text: string
    icon: typeof Calendar
  }
> = {
  user_set: {
    bg: 'bg-slate-50 dark:bg-slate-900/40',
    border: 'border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-200',
    icon: Calendar,
  },
  user_set_firm: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-700',
    text: 'text-amber-900 dark:text-amber-100',
    icon: CalendarClock,
  },
  hard_external_deadline: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-900 dark:text-red-100',
    icon: AlertTriangle,
  },
}

export function TimeframeBanner({ sectionPlan }: { sectionPlan: SectionPlanRow }) {
  const style = STYLES[sectionPlan.timeframe_kind]
  const Icon = style.icon

  const start = parseISO(sectionPlan.start_date)
  const end = parseISO(sectionPlan.end_date)
  const today = new Date()
  const daysToEnd = differenceInCalendarDays(end, today)
  const daysToStart = differenceInCalendarDays(start, today)
  const totalDays = differenceInCalendarDays(end, start) + 1

  let countdown: string
  if (daysToStart > 0) {
    countdown = `Starts in ${daysToStart} ${daysToStart === 1 ? 'day' : 'days'}`
  } else if (daysToEnd >= 0) {
    countdown = `${daysToEnd} ${daysToEnd === 1 ? 'day' : 'days'} remaining`
  } else {
    countdown = `Ended ${Math.abs(daysToEnd)} ${Math.abs(daysToEnd) === 1 ? 'day' : 'days'} ago`
  }

  return (
    <div
      className={cn(
        'rounded-md border px-4 py-3 flex items-start gap-3',
        style.bg,
        style.border,
        style.text,
      )}
    >
      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold text-sm">
            {SECTION_PLAN_TIMEFRAME_KIND_LABELS[sectionPlan.timeframe_kind]}
          </span>
          <span className="text-xs opacity-80">
            {format(start, 'dd MMM')} → {format(end, 'dd MMM yyyy')} ({totalDays}d)
          </span>
          <span className="text-xs font-medium">{countdown}</span>
        </div>
        {sectionPlan.external_anchor_label && (
          <p className="text-sm mt-0.5">
            <span className="opacity-70">Anchor:</span>{' '}
            {sectionPlan.external_anchor_label}
          </p>
        )}
      </div>
    </div>
  )
}
