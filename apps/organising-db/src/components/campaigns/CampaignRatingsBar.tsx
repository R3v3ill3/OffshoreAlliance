'use client'

import { useMemo } from 'react'
import type { CampaignRatingBuckets } from '@/lib/hooks/useCampaignsAllStats'

interface RatingSegment {
  label: string
  count: number
  pct: number
  colorClass: string
  tooltip: string
}

interface CampaignRatingsBarProps {
  ratings: CampaignRatingBuckets
  namedWorkers: number
  /** Height of the bar in pixels, default 16 */
  height?: number
}

/**
 * Compact horizontal stacked bar showing the distribution of worker ratings
 * for a single campaign, using the same colour buckets as the wall chart.
 *
 * Wall chart colour mapping:
 *   no rating → zinc-300 (grey)
 *   rating < 2 → sky-500  (blue)
 *   rating 2–3 → emerald-500 (green)
 *   rating 3–4 → amber-500 (amber)
 *   rating 4+  → red-500   (red)
 */
export function CampaignRatingsBar({
  ratings,
  namedWorkers,
  height = 16,
}: CampaignRatingsBarProps) {
  const segments = useMemo((): RatingSegment[] => {
    const total = namedWorkers
    if (total === 0) return []

    const pct = (n: number) => Math.round((n / total) * 1000) / 10

    const unrated = total - (ratings.r1 + ratings.r2 + ratings.r3 + ratings.r4)

    return [
      {
        label: 'Rating 1 (most active)',
        count: ratings.r1,
        pct: pct(ratings.r1),
        colorClass: 'bg-sky-500',
        tooltip: `Rating 1: ${ratings.r1} workers (${pct(ratings.r1)}%)`,
      },
      {
        label: 'Rating 2',
        count: ratings.r2,
        pct: pct(ratings.r2),
        colorClass: 'bg-emerald-500',
        tooltip: `Rating 2: ${ratings.r2} workers (${pct(ratings.r2)}%)`,
      },
      {
        label: 'Rating 3',
        count: ratings.r3,
        pct: pct(ratings.r3),
        colorClass: 'bg-amber-500',
        tooltip: `Rating 3: ${ratings.r3} workers (${pct(ratings.r3)}%)`,
      },
      {
        label: 'Rating 4–5 (least active)',
        count: ratings.r4,
        pct: pct(ratings.r4),
        colorClass: 'bg-red-500',
        tooltip: `Rating 4–5: ${ratings.r4} workers (${pct(ratings.r4)}%)`,
      },
      {
        label: 'Not yet rated',
        count: unrated,
        pct: pct(unrated),
        colorClass: 'bg-zinc-300',
        tooltip: `Not yet rated: ${unrated} workers (${pct(unrated)}%)`,
      },
    ].filter((s) => s.count > 0)
  }, [ratings, namedWorkers])

  if (namedWorkers === 0) {
    return <span className="text-xs text-muted-foreground">No workers</span>
  }

  if (segments.length === 0) {
    return <span className="text-xs text-muted-foreground">No ratings yet</span>
  }

  return (
    <div className="w-full min-w-[80px]">
      <div
        className="flex w-full overflow-hidden rounded"
        style={{ height }}
        title={segments.map((s) => s.tooltip).join(' | ')}
      >
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.colorClass} flex-shrink-0`}
            style={{ width: `${seg.pct}%` }}
            title={seg.tooltip}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 mt-1">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <span className={`inline-block h-2 w-2 rounded-sm flex-shrink-0 ${seg.colorClass}`} />
            {seg.pct}%
          </span>
        ))}
      </div>
    </div>
  )
}
