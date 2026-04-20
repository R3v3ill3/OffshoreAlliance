'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  buildCampaignAggStatsForWorkerSubset,
  type CampaignListMemberRow,
  type CampaignListRatingRow,
  type CampaignOrganisingUnitRow,
} from '@/lib/hooks/useCampaignListStats'
import type { CampaignAggStats, P2wCompletion } from '@/lib/hooks/useCampaignsAllStats'
import { formatLeadershipRatio, formatPct } from '@/lib/hooks/useCampaignsAllStats'
import { CampaignRatingsBar } from '@/components/campaigns/CampaignRatingsBar'
import { humanizeOuType, ouDisplayName } from '@/components/campaigns/wall-chart/types'
import { Skeleton } from '@/components/ui/skeleton'

function MetricCell({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-sm align-top">{children}</td>
}

function PctPill({
  value,
  denominator,
  className,
}: {
  value: number
  denominator: number | null
  className?: string
}) {
  const d = denominator ?? 0
  if (d === 0) return <span className="text-xs text-muted-foreground">—</span>
  const pct = Math.round((value / d) * 1000) / 10
  const color =
    pct >= 70
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      : pct >= 40
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${color} ${className ?? ''}`}
    >
      {pct}%
    </span>
  )
}

type TaskRow = {
  assigned_ou_id: number
  stage_number: number
  plan_ambition_id: number | null
  title: string
  plan_ambitions: {
    ambition_id: number
    custom_text: string | null
    ambition_options: { option_text: string } | { option_text: string }[] | null
  } | null
}

function normalizeRel<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function ambitionLabel(task: TaskRow): string {
  const pa = task.plan_ambitions
  if (pa?.custom_text?.trim()) return pa.custom_text.trim()
  const opt = normalizeRel(pa?.ambition_options)
  if (opt?.option_text?.trim()) return opt.option_text.trim()
  return task.title
}

interface CampaignUnitMetricsTableProps {
  campaignId: number
  organisingUnits: CampaignOrganisingUnitRow[]
  members: CampaignListMemberRow[]
  ratings: CampaignListRatingRow[]
  ouAssign: { ou_id: number; worker_id: number }[]
  campaignOuCount: number
  campaignEstimate: number
  emptyP2w: Map<number, P2wCompletion>
  isLoadingParent: boolean
}

export function CampaignUnitMetricsTable({
  campaignId,
  organisingUnits,
  members,
  ratings,
  ouAssign,
  campaignOuCount,
  campaignEstimate,
  emptyP2w,
  isLoadingParent,
}: CampaignUnitMetricsTableProps) {
  const supabase = createClient()

  const { data: unitSummary = [], isLoading: summaryLoading } = useQuery({
    queryKey: ['campaign-unit-overview-summary', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_worker_unit_membership_summary')
        .select('worker_id, is_multi_unit_member')
        .eq('campaign_id', campaignId)
      if (error) throw error
      return (data ?? []) as { worker_id: number; is_multi_unit_member: boolean | null }[]
    },
    staleTime: 60_000,
  })

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['campaign-unit-overview-tasks', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_stage_workplan_tasks')
        .select(
          `
          assigned_ou_id,
          stage_number,
          plan_ambition_id,
          title,
          plan_ambitions (
            ambition_id,
            custom_text,
            ambition_options ( option_text )
          )
        `
        )
        .eq('campaign_id', campaignId)
        .not('assigned_ou_id', 'is', null)
      if (error) throw error
      return (data ?? []) as unknown as TaskRow[]
    },
    staleTime: 60_000,
  })

  const multiByWorker = useMemo(() => {
    const m = new Map<number, boolean>()
    for (const r of unitSummary) {
      m.set(r.worker_id, !!r.is_multi_unit_member)
    }
    return m
  }, [unitSummary])

  const ambitionsByOu = useMemo(() => {
    const map = new Map<number, { label: string; stage: number; key: string }[]>()
    for (const t of tasks) {
      if (t.assigned_ou_id == null) continue
      const label = ambitionLabel(t)
      const key = `${t.plan_ambition_id ?? t.title}-${t.stage_number}`
      const list = map.get(t.assigned_ou_id) ?? []
      if (!list.some((x) => x.key === key)) {
        list.push({ label, stage: t.stage_number, key })
      }
      map.set(t.assigned_ou_id, list)
    }
    return map
  }, [tasks])

  const workersByOu = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const o of organisingUnits) {
      map.set(o.ou_id, new Set())
    }
    for (const a of ouAssign) {
      const set = map.get(a.ou_id)
      if (set) set.add(a.worker_id)
    }
    return map
  }, [organisingUnits, ouAssign])

  const isLoading = isLoadingParent || summaryLoading || tasksLoading

  if (organisingUnits.length === 0) {
    return (
      <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
        No organising units yet. Add units in Structure or the wall chart.
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto rounded-md border">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Unit
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Mapping
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Membership
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Networks
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Leadership
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap min-w-[120px]">
              Ratings
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Participation
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Ambitions
            </th>
          </tr>
        </thead>
        <tbody>
          {organisingUnits.map((ou) => {
            const workerSet = workersByOu.get(ou.ou_id) ?? new Set<number>()
            const namedInUnit = workerSet.size
            const denom =
              ou.total_workers_estimated && ou.total_workers_estimated > 0
                ? ou.total_workers_estimated
                : campaignEstimate > 0
                  ? campaignEstimate
                  : namedInUnit > 0
                    ? namedInUnit
                    : null

            const inAnyOu = workerSet.size
            const subStats: CampaignAggStats = buildCampaignAggStatsForWorkerSubset(
              workerSet,
              members,
              ratings,
              campaignOuCount,
              inAnyOu,
              emptyP2w
            )

            let multiInUnit = 0
            for (const wid of workerSet) {
              if (multiByWorker.get(wid)) multiInUnit++
            }

            const ambList = ambitionsByOu.get(ou.ou_id) ?? []
            const showAmb = ambList.slice(0, 3)
            const rest = ambList.length - showAmb.length

            return (
              <tr key={ou.ou_id} className="border-b transition-colors hover:bg-muted/30">
                <MetricCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium leading-tight">
                      {ouDisplayName(ou)}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {humanizeOuType(ou.ou_type)}
                    </span>
                    {ou.total_workers_estimated != null && ou.total_workers_estimated > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Est. {ou.total_workers_estimated.toLocaleString()} workers
                      </span>
                    )}
                  </div>
                </MetricCell>
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span>
                        <span className="font-medium">{subStats.namedWorkers}</span>
                        <span className="text-muted-foreground"> named</span>
                        {denom != null && denom > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({formatPct(subStats.namedWorkers, denom)})
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {formatPct(subStats.phoneCount, denom)} phone •{' '}
                        {formatPct(subStats.emailCount, denom)} email
                      </span>
                    </div>
                  )}
                </MetricCell>
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <PctPill value={subStats.memberLikeCount} denominator={denom} />
                      <span className="text-[10px] text-muted-foreground">
                        {subStats.memberLikeCount} members
                      </span>
                    </div>
                  )}
                </MetricCell>
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5" title="Share of workers in this unit assigned to more than one organising unit">
                      <PctPill value={multiInUnit} denominator={subStats.namedWorkers || null} />
                      <span className="text-[10px] text-muted-foreground">
                        {multiInUnit}/{subStats.namedWorkers || 0} multi-unit
                      </span>
                    </div>
                  )}
                </MetricCell>
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-xs">
                        {formatLeadershipRatio(subStats.leadershipTotal, denom)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {subStats.leadershipTotal} leaders
                      </span>
                    </div>
                  )}
                </MetricCell>
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    <CampaignRatingsBar
                      ratings={subStats.ratings}
                      namedWorkers={subStats.namedWorkers}
                      height={14}
                    />
                  )}
                </MetricCell>
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <PctPill value={subStats.participationCount} denominator={denom} />
                      <span className="text-[10px] text-muted-foreground">
                        {subStats.participationCount} supportive
                      </span>
                    </div>
                  )}
                </MetricCell>
                <MetricCell>
                  <div className="flex flex-col gap-1 max-w-[220px]" onClick={(e) => e.stopPropagation()}>
                    {ambList.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <>
                        {showAmb.map((a) => (
                          <Link
                            key={a.key}
                            href={`/campaigns/${campaignId}/plan/stage/${a.stage}`}
                            className="text-xs text-primary hover:underline leading-snug line-clamp-2"
                          >
                            {a.label}
                          </Link>
                        ))}
                        {rest > 0 && (
                          <Link
                            href={`/campaigns/${campaignId}/plan`}
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            +{rest} more
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </MetricCell>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
