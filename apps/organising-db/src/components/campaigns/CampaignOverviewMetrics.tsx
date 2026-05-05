'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Award, BarChart3, ExternalLink, LayoutGrid, Network, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { useCampaignListStats } from '@/lib/hooks/useCampaignListStats'
import { useCampaignAmbitionsByStage } from '@/lib/hooks/useGateAssessment'
import {
  evaluateAmbitions,
  resolveMetricType,
  type PlanAmbitionWithOption,
} from '@/lib/utils/ambition-gate-logic'
import { STAGE_NAMES } from '@/types/planner-types'
import type { P2wCompletion } from '@/lib/hooks/useCampaignsAllStats'
import { CampaignDashboardStatCard } from '@/components/campaigns/campaign-dashboard-stat-card'
import { CampaignPlanningVisual } from '@/components/campaigns/CampaignPlanningVisual'
import { CampaignUnitMetricsTable } from '@/components/campaigns/CampaignUnitMetricsTable'
import { OverviewMetricBar } from '@/components/campaigns/overview-metric-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AssessmentsProgressFrame } from '@/components/campaigns/AssessmentsProgressFrame'

const EMPTY_P2W = new Map<number, P2wCompletion>()

type StageProgressDatum = {
  stage: string
  stageLabel: string
  ambitionCount: number
  metCount: number
  current: number
  target: number
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value?.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function ambitionNumericTarget(ambition: PlanAmbitionWithOption): number | null {
  const metric = resolveMetricType(ambition)
  if (metric === 'count' || metric === 'percentage') {
    return parseNumber(ambition.target_value)
  }
  if (metric === 'range') {
    return parseNumber(ambition.target_value_max) ?? parseNumber(ambition.target_value)
  }
  return null
}

function ambitionNumericCurrent(ambition: PlanAmbitionWithOption): number {
  const metric = resolveMetricType(ambition)
  if (metric === 'count' || metric === 'percentage' || metric === 'range') {
    return parseNumber(ambition.current_value) ?? 0
  }
  return 0
}

export function CampaignOverviewMetrics({
  campaignId,
  campaignLabel,
}: {
  campaignId: number
  campaignLabel?: string
}) {
  const {
    stats,
    totalWorkerEstimate,
    stagePlans,
    organisingUnits,
    members,
    ratings,
    ouAssign,
    isLoading,
  } = useCampaignListStats(campaignId)

  const { data: ambitionsByStage } = useCampaignAmbitionsByStage(campaignId)

  const summary = useMemo(() => {
    const totalEstimate = totalWorkerEstimate
    const totalNamed = stats.namedWorkers
    const totalMembers = stats.memberLikeCount
    const totalOaMembers = stats.oaMemberCount
    const totalLeaders = stats.leadershipTotal
    const totalRated = stats.participationCount

    const mappingPct =
      totalEstimate > 0 ? Math.round((totalNamed / totalEstimate) * 1000) / 10 : null
    const membershipPct =
      totalEstimate > 0 ? Math.round((totalMembers / totalEstimate) * 1000) / 10 : null
    const oaMembershipPct =
      totalEstimate > 0 ? Math.round((totalOaMembers / totalEstimate) * 1000) / 10 : null
    const participationPct =
      totalEstimate > 0 ? Math.round((totalRated / totalEstimate) * 1000) / 10 : null
    const leaderRatio =
      totalLeaders > 0 && totalEstimate > 0
        ? `1 : ${Math.round(totalEstimate / totalLeaders)}`
        : totalLeaders > 0
          ? `${totalLeaders}`
          : '—'

    return {
      totalEstimate,
      totalNamed,
      mappingPct,
      membershipPct,
      oaMembershipPct,
      totalOaMembers,
      participationPct,
      leaderRatio,
      totalLeaders,
    }
  }, [stats, totalWorkerEstimate])

  const ambitionStageData = useMemo((): StageProgressDatum[] => {
    if (!ambitionsByStage) return []

    const stageRows = Object.entries(ambitionsByStage)
      .map(([stageNumber, rows]) => ({
        stageNumber: Number(stageNumber),
        rows: (rows ?? []) as PlanAmbitionWithOption[],
      }))
      .filter(({ stageNumber, rows }) => Number.isFinite(stageNumber) && rows.length > 0)
      .sort((a, b) => a.stageNumber - b.stageNumber)

    return stageRows.map(({ stageNumber, rows }) => {
      const evaluation = evaluateAmbitions(rows)
      let targetTotal = 0
      let currentTotal = 0

      for (const ambition of rows) {
        const target = ambitionNumericTarget(ambition)
        if (target == null || target <= 0) continue
        const current = ambitionNumericCurrent(ambition)
        targetTotal += target
        currentTotal += Math.max(0, Math.min(current, target))
      }

      const stageProgress = targetTotal > 0 ? Math.min(100, (currentTotal / targetTotal) * 100) : 0

      return {
        stage: `S${stageNumber}`,
        stageLabel: STAGE_NAMES[stageNumber as keyof typeof STAGE_NAMES] ?? `Stage ${stageNumber}`,
        ambitionCount: evaluation.totalCount,
        metCount: evaluation.metCount,
        current: Math.round(stageProgress * 10) / 10,
        target: 100,
      }
    })
  }, [ambitionsByStage])

  const leadershipDensityPct =
    summary.totalEstimate > 0 && summary.totalLeaders > 0
      ? Math.min(100, (summary.totalLeaders / summary.totalEstimate) * 100)
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {isLoading ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-[4.5rem] flex-1 min-w-[130px] rounded-lg" />
            ))}
          </>
        ) : (
          <>
            <CampaignDashboardStatCard
              icon={Users}
              label="Total estimate"
              value={summary.totalEstimate.toLocaleString()}
              sub="this campaign"
            />
            <CampaignDashboardStatCard
              icon={UserCheck}
              label="Mapping"
              value={summary.mappingPct != null ? `${summary.mappingPct}%` : '—'}
              sub={`${summary.totalNamed.toLocaleString()} named workers`}
            />
            <CampaignDashboardStatCard
              icon={Award}
              label="Membership"
              value={summary.membershipPct != null ? `${summary.membershipPct}%` : '—'}
              sub="members of estimated workers"
            />
            <CampaignDashboardStatCard
              icon={ShieldCheck}
              label="OA Members"
              value={summary.oaMembershipPct != null ? `${summary.oaMembershipPct}%` : '—'}
              sub={`${summary.totalOaMembers.toLocaleString()} financial & pending`}
              highlight
            />
            <CampaignDashboardStatCard
              icon={Network}
              label="Leadership"
              value={summary.leaderRatio}
              sub={`${summary.totalLeaders} leaders`}
            />
            <CampaignDashboardStatCard
              icon={BarChart3}
              label="Participation"
              value={summary.participationPct != null ? `${summary.participationPct}%` : '—'}
              sub="workers supportive on ≥ 1 activity"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Campaign plan progress</CardTitle>
            <CardDescription>
              Playing to Win steps by stage. Click a stage to open its planner.
            </CardDescription>
          </div>
          <Link
            href={`/campaigns/${campaignId}/plan`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline shrink-0"
          >
            View campaign plan
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          <CampaignPlanningVisual
            campaignId={campaignId}
            stagePlans={stagePlans}
            p2wByPlanId={stats.p2wByPlanId}
          />
        </CardContent>
      </Card>

      <AssessmentsProgressFrame campaignId={campaignId} campaignLabel={campaignLabel} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Organising unit summaries</h3>
          <Button asChild>
            <Link href={`/campaigns/${campaignId}?tab=wall`}>
              <LayoutGrid className="h-4 w-4" />
              Wall chart
            </Link>
          </Button>
        </div>
        <CampaignUnitMetricsTable
          campaignId={campaignId}
          organisingUnits={organisingUnits}
          members={members}
          ratings={ratings}
          ouAssign={ouAssign}
          campaignOuCount={organisingUnits.length}
          campaignEstimate={summary.totalEstimate}
          emptyP2w={EMPTY_P2W}
          isLoadingParent={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign KPIs</CardTitle>
          <CardDescription>Progress against worker estimate (target markers at full mapping / density).</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-6">
          <OverviewMetricBar
            label="Mapping"
            percent={summary.mappingPct}
            fractionLabel={`${summary.totalNamed} / ${summary.totalEstimate > 0 ? summary.totalEstimate.toLocaleString() : '—'}`}
            targetLabel="Target: 100%"
            targetMarkerPercent={100}
            variant="blue"
          />
          <OverviewMetricBar
            label="Membership"
            percent={summary.membershipPct}
            fractionLabel={`${stats.memberLikeCount} / ${summary.totalEstimate > 0 ? summary.totalEstimate.toLocaleString() : '—'}`}
            targetLabel="Target: 100%"
            targetMarkerPercent={100}
            variant="green"
          />
          <OverviewMetricBar
            label="OA Members (financial & pending)"
            percent={summary.oaMembershipPct}
            fractionLabel={`${stats.oaMemberCount} / ${summary.totalEstimate > 0 ? summary.totalEstimate.toLocaleString() : '—'}`}
            targetLabel="Target: 100%"
            targetMarkerPercent={100}
            variant="green"
          />
          <OverviewMetricBar
            label="Participation"
            percent={summary.participationPct}
            fractionLabel={`${stats.participationCount} / ${summary.totalEstimate > 0 ? summary.totalEstimate.toLocaleString() : '—'}`}
            targetLabel="Target: 100%"
            targetMarkerPercent={100}
            variant="blue"
          />
          <OverviewMetricBar
            label="Leadership density"
            percent={leadershipDensityPct}
            fractionLabel={`${summary.totalLeaders} / ${summary.totalEstimate > 0 ? summary.totalEstimate.toLocaleString() : '—'}`}
            targetLabel={`Ratio: ${summary.leaderRatio}`}
            targetMarkerPercent={100}
            variant="green"
          />
        </CardContent>
      </Card>

      {ambitionStageData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ambition progress by stage</CardTitle>
            <CardDescription>Weighted progress toward numeric ambition targets per stage.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-6">
            {ambitionStageData.map((row, i) => (
              <OverviewMetricBar
                key={row.stage}
                label={row.stageLabel}
                percent={row.current}
                fractionLabel={`${row.metCount} / ${row.ambitionCount} ambitions met`}
                targetLabel="Target: 100%"
                targetMarkerPercent={100}
                variant={i % 2 === 0 ? 'blue' : 'green'}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
