'use client'

export type OverviewMetricBarVariant = 'blue' | 'green'

export function OverviewMetricBar({
  label,
  percent,
  fractionLabel,
  targetLabel = 'Target: 100%',
  targetMarkerPercent = 100,
  variant = 'blue',
}: {
  label: string
  percent: number | null
  fractionLabel: string
  targetLabel?: string
  /** 0–100 position of vertical target marker on the track */
  targetMarkerPercent?: number
  variant?: OverviewMetricBarVariant
}) {
  const fillCls = variant === 'blue' ? 'bg-sky-500' : 'bg-emerald-500'
  const markerCls = variant === 'blue' ? 'bg-sky-200' : 'bg-emerald-200'
  const p =
    percent == null || !Number.isFinite(percent) ? 0 : Math.max(0, Math.min(100, percent))
  const markerPos = Math.max(0, Math.min(100, targetMarkerPercent))

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2 text-xs">
        <span className="font-semibold text-foreground/90 leading-tight">{label}</span>
        <span className="font-semibold tabular-nums text-foreground/90 shrink-0">
          {percent != null && Number.isFinite(percent) ? `${Math.round(p * 10) / 10}%` : '—'}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-zinc-900 dark:bg-zinc-950">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${fillCls}`}
          style={{ width: `${p}%` }}
        />
        <div
          className={`absolute top-0 bottom-0 w-0.5 rounded-full ${markerCls} opacity-90 pointer-events-none`}
          style={{ left: `${markerPos}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{fractionLabel}</span>
        <span className="shrink-0">{targetLabel}</span>
      </div>
    </div>
  )
}
