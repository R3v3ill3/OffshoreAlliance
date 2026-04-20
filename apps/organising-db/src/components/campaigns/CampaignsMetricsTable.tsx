'use client'

import Link from 'next/link'
import {
  type CampaignAggStats,
  getStatsForCampaign,
  formatLeadershipRatio,
  formatPct,
} from '@/lib/hooks/useCampaignsAllStats'
import { CampaignRatingsBar } from '@/components/campaigns/CampaignRatingsBar'
import { CampaignPlanningVisual } from '@/components/campaigns/CampaignPlanningVisual'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface StagePlanSummary {
  plan_id: number
  stage_number: number
  stage_name: string
  status: string
}

interface CampaignRowMin {
  campaign_id: number
  name: string
  campaign_type: string
  status: string
  total_worker_estimate: number | null
  organiser: { organiser_name: string } | null
  campaign_stage_plans: StagePlanSummary[]
}

interface CampaignsMetricsTableProps {
  campaigns: CampaignRowMin[]
  statsMap: Map<number, CampaignAggStats>
  isLoading: boolean
  onRowClick?: (campaignId: number) => void
}

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
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${color} ${className ?? ''}`}>
      {pct}%
    </span>
  )
}

const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'info' | 'warning'> = {
  planning: 'secondary',
  active: 'success',
  completed: 'info',
  suspended: 'warning',
}

export function CampaignsMetricsTable({
  campaigns,
  statsMap,
  isLoading,
  onRowClick,
}: CampaignsMetricsTableProps) {
  if (campaigns.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No campaigns to display.
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto rounded-md border">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Campaign
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
              Planning
            </th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const stats = getStatsForCampaign(statsMap, c.campaign_id)
            const estimate = c.total_worker_estimate

            return (
              <tr
                key={c.campaign_id}
                className="border-b transition-colors hover:bg-muted/30 cursor-pointer"
                onClick={() => onRowClick?.(c.campaign_id)}
              >
                {/* Campaign name */}
                <MetricCell>
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/campaigns/${c.campaign_id}`}
                      className="font-medium hover:underline text-foreground leading-tight"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.name}
                    </Link>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge
                        variant={STATUS_VARIANT[c.status] ?? 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {c.status}
                      </Badge>
                      {c.organiser && (
                        <span className="text-[10px] text-muted-foreground">
                          {c.organiser.organiser_name}
                        </span>
                      )}
                    </div>
                    {estimate != null && estimate > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Est. {estimate.toLocaleString()} workers
                      </span>
                    )}
                  </div>
                </MetricCell>

                {/* Mapping */}
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span>
                        <span className="font-medium">{stats.namedWorkers}</span>
                        <span className="text-muted-foreground"> named</span>
                        {estimate != null && estimate > 0 && (
                          <span className="text-muted-foreground">
                            {' '}({formatPct(stats.namedWorkers, estimate)})
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {formatPct(stats.phoneCount, estimate)} phone •{' '}
                        {formatPct(stats.emailCount, estimate)} email
                      </span>
                    </div>
                  )}
                </MetricCell>

                {/* Membership */}
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <PctPill value={stats.memberLikeCount} denominator={estimate} />
                      <span className="text-[10px] text-muted-foreground">
                        {stats.memberLikeCount} members
                      </span>
                    </div>
                  )}
                </MetricCell>

                {/* Networks */}
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <PctPill value={stats.workersInAnyOu} denominator={stats.namedWorkers} />
                      <span className="text-[10px] text-muted-foreground">
                        {stats.workersInAnyOu}/{stats.namedWorkers} in {stats.ouCount} OUs
                      </span>
                    </div>
                  )}
                </MetricCell>

                {/* Leadership */}
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-xs">
                        {formatLeadershipRatio(stats.leadershipTotal, estimate)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {stats.leadershipTotal} leaders
                      </span>
                    </div>
                  )}
                </MetricCell>

                {/* Ratings */}
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    <CampaignRatingsBar
                      ratings={stats.ratings}
                      namedWorkers={stats.namedWorkers}
                      height={14}
                    />
                  )}
                </MetricCell>

                {/* Participation */}
                <MetricCell>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <PctPill value={stats.participationCount} denominator={estimate} />
                      <span className="text-[10px] text-muted-foreground">
                        {stats.participationCount} supportive
                      </span>
                    </div>
                  )}
                </MetricCell>

                {/* Planning */}
                <MetricCell>
                  <CampaignPlanningVisual
                    campaignId={c.campaign_id}
                    stagePlans={c.campaign_stage_plans}
                    p2wByPlanId={stats.p2wByPlanId}
                  />
                </MetricCell>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
