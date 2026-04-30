'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { ChevronDown, ChevronRight, Scale, Clock, FileText, AlertTriangle } from 'lucide-react'
import { useIntractableState } from '@/hooks/useIntractableState'

interface IntractableBannerCardProps {
  campaignId: number
}

function Metric({
  icon: Icon,
  label,
  children,
  iconClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  iconClassName?: string
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', iconClassName)} />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium leading-none mb-0.5">
          {label}
        </p>
        <div className="text-xs text-slate-700 leading-snug">{children}</div>
      </div>
    </div>
  )
}

/** Colour palette keyed by intractable state. */
const STATE_STYLES = {
  safe: {
    border: 'border-green-100',
    bg: 'bg-green-50/60',
    titleText: 'text-green-700',
    chevron: 'text-green-400',
    iconClass: 'text-green-500',
  },
  approaching: {
    border: 'border-amber-100',
    bg: 'bg-amber-50/60',
    titleText: 'text-amber-700',
    chevron: 'text-amber-400',
    iconClass: 'text-amber-500',
  },
  eligible: {
    border: 'border-red-200',
    bg: 'bg-red-50/60',
    titleText: 'text-red-700',
    chevron: 'text-red-400',
    iconClass: 'text-red-500',
  },
  applied: {
    border: 'border-red-200',
    bg: 'bg-red-50/60',
    titleText: 'text-red-700',
    chevron: 'text-red-400',
    iconClass: 'text-red-500',
  },
  declared: {
    border: 'border-red-200',
    bg: 'bg-red-50/60',
    titleText: 'text-red-700',
    chevron: 'text-red-400',
    iconClass: 'text-red-500',
  },
  arbitrated: {
    border: 'border-red-200',
    bg: 'bg-red-50/60',
    titleText: 'text-red-700',
    chevron: 'text-red-400',
    iconClass: 'text-red-500',
  },
} as const

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Banner card showing the intractable bargaining tracker state for a campaign.
 * Mirrors the visual pattern of CurrentSituationBanner.tsx. Colour-graded:
 *   safe       → green
 *   approaching → amber
 *   eligible / applied / declared / arbitrated → red
 *
 * Returns null when the campaign has no tracker row.
 */
export function IntractableBannerCard({ campaignId }: IntractableBannerCardProps) {
  const [expanded, setExpanded] = useState(true)
  const { data } = useIntractableState(campaignId)

  if (!data) return null

  const styles = STATE_STYLES[data.state] ?? STATE_STYLES.eligible

  return (
    <div className={cn('rounded-lg border', styles.border, styles.bg)}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={cn('text-xs font-semibold', styles.titleText)}>
          Intractable bargaining tracker — {data.state_label}
        </span>
        {expanded ? (
          <ChevronDown className={cn('h-3.5 w-3.5', styles.chevron)} />
        ) : (
          <ChevronRight className={cn('h-3.5 w-3.5', styles.chevron)} />
        )}
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-3 pb-3 space-y-2">
          {/* Headline */}
          <p className="text-xs text-slate-600 italic">{data.headline}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
            <Metric
              icon={Clock}
              label="Days elapsed"
              iconClassName={styles.iconClass}
            >
              <span className="font-semibold">{data.days_elapsed}</span> days
            </Metric>

            <Metric
              icon={AlertTriangle}
              label="Days to threshold"
              iconClassName={styles.iconClass}
            >
              {data.days_remaining_to_threshold > 0 ? (
                <span className="font-semibold">{data.days_remaining_to_threshold}</span>
              ) : (
                <span className="font-semibold text-red-600">
                  {Math.abs(data.days_remaining_to_threshold)} overdue
                </span>
              )}
            </Metric>

            <Metric
              icon={Scale}
              label="Commenced"
              iconClassName={styles.iconClass}
            >
              {formatDate(data.bargaining_commenced_at)}
            </Metric>

            <Metric
              icon={Scale}
              label="9-month threshold"
              iconClassName={styles.iconClass}
            >
              {formatDate(data.nine_month_threshold_at)}
            </Metric>

            {data.intractable_application_filed_at && (
              <Metric
                icon={FileText}
                label="Application filed"
                iconClassName={styles.iconClass}
              >
                {formatDate(data.intractable_application_filed_at)}
              </Metric>
            )}

            {data.intractable_declaration_made_at && (
              <Metric
                icon={FileText}
                label="Declaration made"
                iconClassName={styles.iconClass}
              >
                {formatDate(data.intractable_declaration_made_at)}
              </Metric>
            )}

            {data.arbitration_outcome_recorded_at && (
              <Metric
                icon={FileText}
                label="Arbitration outcome"
                iconClassName={styles.iconClass}
              >
                {formatDate(data.arbitration_outcome_recorded_at)}
              </Metric>
            )}
          </div>

          {data.notes && (
            <p className="text-xs text-slate-500 italic pt-1 border-t border-slate-200">
              {data.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
