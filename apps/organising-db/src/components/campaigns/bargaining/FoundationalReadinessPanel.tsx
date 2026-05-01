'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { Users, Phone, Star, Building2, BarChart2 } from 'lucide-react'
import { useFoundationalReadiness } from '@/hooks/useFoundationalReadiness'

interface FoundationalReadinessPanelProps {
  campaignId: number
}

interface ChipProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  /** Chip colour variant */
  variant: 'neutral' | 'amber' | 'red' | 'green'
  /** Optional link to a deep page */
  href?: string
}

function Chip({ icon: Icon, label, value, variant, href }: ChipProps) {
  const variantClasses = {
    neutral: 'bg-slate-50 border-slate-200 text-slate-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    green: 'bg-green-50 border-green-200 text-green-800',
  }

  const iconClasses = {
    neutral: 'text-slate-400',
    amber: 'text-amber-500',
    red: 'text-red-500',
    green: 'text-green-500',
  }

  const inner = (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
        variantClasses[variant],
        href && 'hover:border-blue-300 hover:text-blue-700 cursor-pointer'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', href ? '' : iconClasses[variant])} />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide font-medium leading-none mb-0.5 opacity-60">
          {label}
        </p>
        <p className="font-semibold leading-none">{value}</p>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{inner}</Link>
  }
  return inner
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function SkeletonChip() {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 animate-pulse">
      <div className="h-2.5 w-16 bg-slate-200 rounded mb-1.5" />
      <div className="h-4 w-10 bg-slate-200 rounded" />
    </div>
  )
}

/**
 * Reads v_campaign_foundational_readiness and displays 5 readiness chips
 * on the Phase 2 bargaining hub. Chips turn amber or red when metrics fall
 * below defined thresholds. Each chip deep-links to the relevant page where
 * the organiser can address the gap.
 *
 * Thresholds:
 *   Allocated coverage  <80%  → amber
 *   Contact coverage    <60%  → amber
 *   Ratings coverage    <20%  → red; <50% → amber
 *   OUs missing leaders  >0   → amber
 */
export function FoundationalReadinessPanel({ campaignId }: FoundationalReadinessPanelProps) {
  const { data, isLoading } = useFoundationalReadiness(campaignId)

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-2">
          Foundational readiness
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => <SkeletonChip key={i} />)}
        </div>
      </div>
    )
  }

  if (!data) return null

  const {
    universe_size,
    workers_allocated,
    workers_with_contact,
    workers_with_rating,
    ous_missing_leaders,
  } = data

  const universeBase = Math.max(universe_size, 1)
  const allocatedPct = workers_allocated / universeBase
  const contactPct = workers_with_contact / universeBase
  const ratedPct = workers_with_rating / universeBase

  // Determine chip variants
  const allocatedVariant: ChipProps['variant'] = allocatedPct < 0.8 ? 'amber' : 'neutral'
  const contactVariant: ChipProps['variant'] = contactPct < 0.6 ? 'amber' : 'neutral'
  const ratedVariant: ChipProps['variant'] =
    ratedPct < 0.2 ? 'red' : ratedPct < 0.5 ? 'amber' : 'neutral'
  const ousMissingVariant: ChipProps['variant'] = ous_missing_leaders > 0 ? 'amber' : 'neutral'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-2">
        Foundational readiness
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* 1. Universe size — neutral, no link */}
        <Chip
          icon={BarChart2}
          label="Universe"
          value={universe_size === 0 ? 'Not set' : universe_size.toLocaleString()}
          variant="neutral"
        />

        {/* 2. Allocated workers — link to workers page */}
        <Chip
          icon={Users}
          label="Allocated"
          value={pct(workers_allocated, universeBase)}
          variant={allocatedVariant}
          href={`/campaigns/${campaignId}/workers`}
        />

        {/* 3. Contact coverage — link to workers page */}
        <Chip
          icon={Phone}
          label="Contact coverage"
          value={pct(workers_with_contact, universeBase)}
          variant={contactVariant}
          href={`/campaigns/${campaignId}/workers`}
        />

        {/* 4. Ratings coverage — link to campaign overview / activities */}
        <Chip
          icon={Star}
          label="Rated"
          value={pct(workers_with_rating, universeBase)}
          variant={ratedVariant}
          href={`/campaigns/${campaignId}`}
        />

        {/* 5. OUs missing leaders — link to units page */}
        <Chip
          icon={Building2}
          label="OUs without leader"
          value={ous_missing_leaders === 0 ? 'None' : ous_missing_leaders}
          variant={ousMissingVariant}
          href={`/campaigns/${campaignId}/units`}
        />
      </div>

      {/* Explanatory footnote when any metric is below threshold */}
      {(allocatedPct < 0.8 || contactPct < 0.6 || ratedPct < 0.5 || ous_missing_leaders > 0) && (
        <p className="text-[10px] text-slate-400 mt-2">
          Amber or red chips indicate gaps you can address as bargaining progresses — they do not
          block access to any Phase 2 features.
        </p>
      )}
    </div>
  )
}
