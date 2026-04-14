'use client'

import { useState } from 'react'
import type { CampaignCurrentStats } from '@/lib/hooks/useCampaignCurrentStats'
import { cn } from '@/lib/utils/cn'
import {
  ChevronDown,
  ChevronRight,
  Users,
  UserCheck,
  Phone,
  Mail,
  LayoutGrid,
  Shield,
} from 'lucide-react'

interface CurrentSituationBannerProps {
  stats: CampaignCurrentStats
}

function Metric({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium leading-none mb-0.5">
          {label}
        </p>
        <div className="text-xs text-slate-700 leading-snug">{children}</div>
      </div>
    </div>
  )
}

export function CurrentSituationBanner({ stats }: CurrentSituationBannerProps) {
  const [expanded, setExpanded] = useState(true)

  const hasData = stats.namedWorkers > 0 || stats.totalWorkerEstimate > 0

  if (!hasData) return null

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-semibold text-blue-700">
          Current situation
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-blue-400" />
        )}
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
          <Metric icon={Users} label="Workers">
            <span className="font-semibold">{stats.namedWorkers}</span> named
            {stats.totalWorkerEstimate > 0 && (
              <>
                {' '}of {stats.totalWorkerEstimate} est.
                <span className="text-slate-400"> ({stats.namedPctOfEstimate}%)</span>
              </>
            )}
          </Metric>

          <Metric icon={UserCheck} label="Members">
            <span className="font-semibold">{stats.memberLikeCount}</span>
            {stats.namedWorkers > 0 && (
              <span className="text-slate-400"> ({stats.densityOfNamed}% of named)</span>
            )}
            {stats.totalWorkerEstimate > 0 && (
              <>
                <br />
                <span className="text-slate-400">{stats.densityOfEstimate}% of est.</span>
              </>
            )}
          </Metric>

          <Metric icon={Shield} label="Leadership">
            <span className="font-semibold">{stats.delegates}</span> del
            {' / '}
            <span className="font-semibold">{stats.activists}</span> act
            {' / '}
            <span className="font-semibold">{stats.contacts}</span> con
          </Metric>

          <Metric icon={LayoutGrid} label="Organising units">
            <span className="font-semibold">{stats.ouCount}</span> total
            {stats.ouCount > 0 && (
              <span className="text-slate-400">
                , {stats.ousWithDelegate} with delegate
              </span>
            )}
          </Metric>

          <Metric icon={Phone} label="Phone">
            <span className="font-semibold">{stats.phoneCount}</span>
            {stats.namedWorkers > 0 && (
              <span className="text-slate-400"> ({stats.phonePct}%)</span>
            )}
          </Metric>

          <Metric icon={Mail} label="Email">
            <span className="font-semibold">{stats.emailCount}</span>
            {stats.namedWorkers > 0 && (
              <span className="text-slate-400"> ({stats.emailPct}%)</span>
            )}
          </Metric>
        </div>
      </div>
    </div>
  )
}
