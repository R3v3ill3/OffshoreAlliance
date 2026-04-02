'use client'

import { useState } from 'react'
import { useCampaign, useCampaigns } from '@/lib/hooks/useCampaigns'
import { useAllGates, useCampaignAmbitionsByStage } from '@/lib/hooks/useGateAssessment'
import {
  ambitionDisplayName,
  evaluateAmbitions,
  evaluatePlanAmbition,
  type PlanAmbitionWithOption,
} from '@/lib/utils/ambition-gate-logic'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { differenceInDays, format } from 'date-fns'
import { Download, Camera, BarChart3, TrendingUp, Shield, Clock, Target } from 'lucide-react'
import { STAGE_NAMES } from '@/types'
import { toast } from 'sonner'

function timelineFromCampaign(
  c: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!c) return null
  const tl = c.campaign_timelines as unknown
  if (Array.isArray(tl)) return (tl[0] as Record<string, unknown>) ?? null
  return (tl as Record<string, unknown>) ?? null
}

export default function ReportsPage() {
  const { data: campaigns, isLoading } = useCampaigns()
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | undefined>(undefined)
  const [takingSnapshot, setTakingSnapshot] = useState(false)

  const detailEnabled = !!selectedCampaignId && selectedCampaignId > 0
  const { data: campaignDetail, isLoading: detailLoading } = useCampaign(
    selectedCampaignId ?? 0,
    { enabled: detailEnabled }
  )
  const { data: gates } = useAllGates(selectedCampaignId ?? 0)
  const { data: ambitionsByStage } = useCampaignAmbitionsByStage(selectedCampaignId ?? 0)

  const selectedCampaign = campaigns?.find((c) => c.campaign_id === selectedCampaignId)

  const detailRecord = campaignDetail as Record<string, unknown> | undefined
  const stagePlans = detailRecord?.campaign_stage_plans
    ? [...(detailRecord.campaign_stage_plans as Record<string, unknown>[])]
        .sort((a, b) => (a.stage_number as number) - (b.stage_number as number))
    : []

  const timeline = timelineFromCampaign(detailRecord) as Record<
    string,
    string | null | undefined
  > | null

  async function handleTakeSnapshot() {
    if (!selectedCampaignId) return
    setTakingSnapshot(true)

    try {
      const response = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: selectedCampaignId, snapshot_type: 'manual' }),
      })

      if (!response.ok) throw new Error('Failed to take snapshot')
      toast.success('Snapshot recorded successfully')
    } catch {
      toast.error('Failed to take snapshot')
    } finally {
      setTakingSnapshot(false)
    }
  }

  function handleExportCSV() {
    if (!selectedCampaign || !campaignDetail) return

    const ambitionCsvRows: string[][] = []
    for (const s of stagePlans) {
      const sn = s.stage_number as number
      const rows = ambitionsByStage?.[sn] as PlanAmbitionWithOption[] | undefined
      if (!rows?.length) continue
      for (const a of rows) {
        const met = evaluatePlanAmbition(a)
        ambitionCsvRows.push([
          `Stage ${sn}`,
          ambitionDisplayName(a).replace(/,/g, ';'),
          met ? 'met' : 'not_met',
          (a.target_date as string) || '',
        ])
      }
    }

    const rows = [
      ['Campaign Report', '', '', '', ''],
      ['Campaign', selectedCampaign.name as string, '', '', ''],
      ['Status', selectedCampaign.status as string, '', '', ''],
      ['', '', '', '', ''],
      ['Stage', 'Stage Name', 'Status', 'Planned start', 'Planned end'],
      ...stagePlans.map((s) => [
        `Stage ${s.stage_number as number}`,
        STAGE_NAMES[s.stage_number as keyof typeof STAGE_NAMES] || '',
        s.status as string,
        (s.planned_start_date as string) || '',
        (s.planned_end_date as string) || '',
      ]),
    ]

    if (ambitionCsvRows.length > 0) {
      rows.push(['', '', '', '', ''])
      rows.push(['Ambitions', '', '', '', ''])
      rows.push(['Stage', 'Ambition', 'Status', 'Target date', ''])
      rows.push(...ambitionCsvRows.map((r) => [...r, '']))
    }

    const csvContent = rows.map((row) => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(selectedCampaign.name as string).replace(/\s+/g, '_')}_report.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-muted-foreground mt-1">Campaign progress summaries and snapshots</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrint} size="sm">
            <Download className="h-4 w-4 mr-1" />
            Print / PDF
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            size="sm"
            disabled={!selectedCampaignId || !campaignDetail}
          >
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
          <Button
            onClick={handleTakeSnapshot}
            disabled={!selectedCampaignId || takingSnapshot}
            size="sm"
          >
            <Camera className="h-4 w-4 mr-1" />
            {takingSnapshot ? 'Saving...' : 'Take Snapshot'}
          </Button>
        </div>
      </div>

      {/* Campaign selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <Select
              value={selectedCampaignId?.toString() || ''}
              onValueChange={(v) => setSelectedCampaignId(parseInt(v))}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Select a campaign to report on..." />
              </SelectTrigger>
              <SelectContent>
                {(campaigns || []).map((c) => (
                  <SelectItem key={c.campaign_id as number} value={(c.campaign_id as number).toString()}>
                    {c.name as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedCampaignId && detailLoading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Loading campaign details…
          </CardContent>
        </Card>
      )}

      {selectedCampaign && campaignDetail && (
        <>
          {/* Campaign overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Campaign Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold text-blue-600">
                    {stagePlans.find((s) => s.status === 'active')?.stage_number as number || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Current Stage</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold text-green-600">
                    {stagePlans.filter((s) => s.status === 'completed').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Stages Complete</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold text-purple-600">
                    {gates?.filter((g) => g.gate_assessments?.some((a: Record<string, unknown>) =>
                      a.outcome === 'passed' || a.outcome === 'override_approved'
                    )).length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Gates Passed</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-50">
                  {timeline?.agreement_expiry_date ? (
                    <>
                      <p className={cn(
                        'text-2xl font-bold',
                        differenceInDays(new Date(timeline.agreement_expiry_date as string), new Date()) < 180
                          ? 'text-red-600'
                          : 'text-amber-600'
                      )}>
                        {Math.ceil(differenceInDays(new Date(timeline.agreement_expiry_date as string), new Date()) / 30)}mo
                      </p>
                      <p className="text-xs text-muted-foreground">To Expiry</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-slate-400">—</p>
                      <p className="text-xs text-muted-foreground">No expiry date</p>
                    </>
                  )}
                </div>
              </div>

              {/* PABO alert */}
              {timeline?.pabo_available_date && (
                <div className={cn(
                  'flex items-center gap-2 p-3 rounded-lg text-sm',
                  differenceInDays(new Date(timeline.pabo_available_date as string), new Date()) < 30
                    ? 'bg-red-50 border border-red-200 text-red-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'
                )}>
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  PABO available from{' '}
                  <strong>{format(new Date(timeline.pabo_available_date as string), 'dd MMM yyyy')}</strong>
                  {' '} (
                  {differenceInDays(new Date(timeline.pabo_available_date as string), new Date()) > 0
                    ? `${differenceInDays(new Date(timeline.pabo_available_date as string), new Date())} days away`
                    : 'available now!'}
                  )
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stage progress table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stage Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stagePlans.map((stage) => (
                  <div key={stage.stage_number as number} className="flex items-center gap-4 py-2 border-b last:border-0">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                      stage.status === 'active' ? 'bg-blue-100 text-blue-700' :
                      stage.status === 'completed' ? 'bg-green-100 text-green-700' :
                      'bg-slate-100 text-slate-400'
                    )}>
                      {stage.stage_number as number}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {STAGE_NAMES[stage.stage_number as keyof typeof STAGE_NAMES]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stage.planned_start_date
                          ? `${format(new Date(stage.planned_start_date as string), 'dd MMM yyyy')} → ${stage.planned_end_date ? format(new Date(stage.planned_end_date as string), 'dd MMM yyyy') : '?'}`
                          : 'No dates set'}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        stage.status === 'active' ? 'bg-blue-100 text-blue-700' :
                        stage.status === 'completed' ? 'bg-green-100 text-green-700' :
                        stage.status === 'blocked' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-500'
                      )}
                    >
                      {stage.status as string}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Ambitions summary (when any stage has ambitions) */}
          {Object.keys(ambitionsByStage || {}).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Ambitions by stage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stagePlans.map((stage) => {
                    const sn = stage.stage_number as number
                    const rows = ambitionsByStage?.[sn] as PlanAmbitionWithOption[] | undefined
                    if (!rows?.length) return null
                    const ev = evaluateAmbitions(rows)
                    return (
                      <div
                        key={sn}
                        className="flex items-center gap-4 py-2 border-b last:border-0"
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-slate-100 text-slate-600">
                          {sn}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {STAGE_NAMES[sn as keyof typeof STAGE_NAMES]}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ev.metCount}/{ev.totalCount} ambitions met
                            {!ev.hardGatesMet ? ' · hard gate open' : ''}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-xs shrink-0',
                            ev.allMet
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600'
                          )}
                        >
                          {ev.allMet ? 'All met' : 'In progress'}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gate status table */}
          {gates && gates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Gate Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {gates.map((gate) => {
                    const stageRows = ambitionsByStage?.[
                      gate.gate_number as number
                    ] as PlanAmbitionWithOption[] | undefined
                    const ambitionEval =
                      stageRows && stageRows.length > 0
                        ? evaluateAmbitions(stageRows)
                        : null

                    const criteria = gate.gate_criteria || []
                    const metCount = criteria.filter(
                      (c: Record<string, unknown>) => c.is_met
                    ).length
                    const latestAssessment = (gate.gate_assessments ||
                      [])[0] as Record<string, unknown>

                    const progressLine =
                      ambitionEval != null
                        ? `${ambitionEval.metCount}/${ambitionEval.totalCount} ambitions met${
                            !ambitionEval.hardGatesMet ? ' (hard gate open)' : ''
                          }`
                        : criteria.length > 0
                          ? `${metCount}/${criteria.length} criteria met`
                          : 'No ambitions or criteria on record'

                    const pendingBadge =
                      ambitionEval != null
                        ? `${ambitionEval.metCount}/${ambitionEval.totalCount} ambitions`
                        : criteria.length > 0
                          ? `${metCount}/${criteria.length} criteria`
                          : '—'

                    return (
                      <div key={gate.gate_id} className="flex items-center gap-4 py-2 border-b last:border-0">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          latestAssessment?.outcome === 'passed' || latestAssessment?.outcome === 'override_approved'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-400'
                        )}>
                          G{gate.gate_number}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{gate.gate_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {progressLine}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-xs',
                            latestAssessment?.outcome === 'passed'
                              ? 'bg-green-100 text-green-700'
                              : latestAssessment?.outcome === 'override_approved'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          {latestAssessment?.outcome
                            ? (latestAssessment.outcome as string).replace(/_/g, ' ')
                            : pendingBadge}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!selectedCampaignId && !isLoading && (
        <div className="text-center py-16">
          <BarChart3 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Select a campaign to view its report</p>
        </div>
      )}
    </div>
  )
}
