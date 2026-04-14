'use client'

import { useMemo } from 'react'
import { useCampaignCurrentStats } from '@/lib/hooks/useCampaignCurrentStats'
import { useCampaignAmbitionsByStage } from '@/lib/hooks/useGateAssessment'
import { evaluateAmbitions, resolveMetricType, type PlanAmbitionWithOption } from '@/lib/utils/ambition-gate-logic'
import { STAGE_NAMES } from '@/types/planner-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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

export function CampaignOverviewMetrics({ campaignId }: { campaignId: number }) {
  const stats = useCampaignCurrentStats(campaignId)
  const { data: ambitionsByStage } = useCampaignAmbitionsByStage(campaignId)

  const unmappedWorkers = Math.max(0, stats.totalWorkerEstimate - stats.namedWorkers)

  const roleBreakdownData = [
    { name: 'Contact', value: stats.contacts },
    { name: 'Activist', value: stats.activists },
    { name: 'Delegate', value: stats.delegates },
    { name: 'Barg. rep', value: stats.bargainingReps },
  ]

  const workerBreakdownData = [
    { name: 'Named workers', value: stats.namedWorkers },
    { name: 'Unmapped (est.)', value: unmappedWorkers },
  ]

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

  const ambitionTotals = useMemo(() => {
    return ambitionStageData.reduce(
      (acc, row) => {
        acc.total += row.ambitionCount
        acc.met += row.metCount
        return acc
      },
      { total: 0, met: 0 }
    )
  }, [ambitionStageData])

  const leadershipTotal = stats.delegates + stats.activists + stats.contacts + stats.bargainingReps

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Workers mapped</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{stats.namedWorkers}</p>
            <p className="text-xs text-muted-foreground">
              {stats.totalWorkerEstimate > 0
                ? `${stats.namedPctOfEstimate}% of ${stats.totalWorkerEstimate} estimated`
                : 'No worker estimate set'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membership density</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{stats.densityOfNamed}%</p>
            <p className="text-xs text-muted-foreground">{stats.memberLikeCount} member-like of named workers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leadership total</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{leadershipTotal}</p>
            <p className="text-xs text-muted-foreground">Contact/Activist/Delegate via OA role, Bargaining rep via member role</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ambitions met</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">
              {ambitionTotals.met}/{ambitionTotals.total}
            </p>
            <p className="text-xs text-muted-foreground">
              {ambitionStageData.length > 0 ? `Across ${ambitionStageData.length} stages` : 'No stage ambitions yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Worker breakdown</CardTitle>
            <CardDescription>Named workers against estimate gap</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={workerBreakdownData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role breakdown</CardTitle>
            <CardDescription>Worker organising roles in this campaign</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={roleBreakdownData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(142 70% 40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ambition progress by stage</CardTitle>
          <CardDescription>Current progress against stage ambition targets</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {ambitionStageData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No ambition progress data available yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={ambitionStageData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} domain={[0, 100]} />
                <Tooltip
                  formatter={(value, key) => {
                    const raw = Array.isArray(value) ? value[0] : value
                    const numeric = typeof raw === 'number' ? raw : Number(raw)
                    const displayPct = Number.isFinite(numeric) ? `${numeric}%` : '—'
                    if (key === 'target') return [displayPct, 'Target']
                    if (key === 'current') return [displayPct, 'Current']
                    return [raw ?? '—', String(key)]
                  }}
                  labelFormatter={(label) => {
                    const row = ambitionStageData.find((item) => item.stage === label)
                    if (!row) return label
                    return `${row.stageLabel} (${row.metCount}/${row.ambitionCount} met)`
                  }}
                />
                <Legend />
                <Bar dataKey="current" name="Current" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="target" name="Target" fill="hsl(210 16% 82%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
