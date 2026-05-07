'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCampaignStageCoverage } from '@/lib/hooks/useStageMapping'

const STAGES: Array<{ n: number; label: string }> = [
  { n: 1, label: 'Contact ID' },
  { n: 2, label: 'Intro Comms' },
  { n: 3, label: 'Mobilisation' },
  { n: 4, label: 'Claims/MSD' },
  { n: 5, label: 'Endorsement' },
  { n: 6, label: 'B2W handover' },
  { n: 7, label: 'Bargaining' },
  { n: 8, label: 'Test Employer' },
  { n: 9, label: 'Strength' },
  { n: 10, label: 'PIA' },
  { n: 11, label: 'Settlement' },
]

interface CampaignStageCoveragePanelProps {
  campaignId: number
}

export function CampaignStageCoveragePanel({
  campaignId,
}: CampaignStageCoveragePanelProps) {
  const { data: coverage = [], isLoading } = useCampaignStageCoverage(campaignId)

  const byStage = useMemo(() => {
    const m: Record<number, typeof coverage> = {}
    for (const r of coverage) (m[r.stage_number] ??= []).push(r)
    return m
  }, [coverage])

  const sectionsCovered = useMemo(() => {
    const ids = new Set<number>()
    for (const r of coverage) ids.add(r.section_plan_id)
    return ids.size
  }, [coverage])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Section coverage by P2W stage</CardTitle>
        <CardDescription>
          Where each section plan maps onto the 11-stage Playing-to-Win
          framework. Chips link through to the section plan's mapping panel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && coverage.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No section plans have generated stage mappings yet.
          </p>
        )}
        {coverage.length > 0 && (
          <TooltipProvider>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {sectionsCovered} section plan{sectionsCovered === 1 ? '' : 's'} mapped
            </p>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-11 gap-1 min-w-[800px]">
                {STAGES.map((s) => {
                  const rows = byStage[s.n] ?? []
                  return (
                    <div key={s.n} className="space-y-1">
                      <div className="text-[10px] font-medium text-muted-foreground px-1">
                        {s.n}. {s.label}
                      </div>
                      <div className="rounded border p-1 min-h-[60px] space-y-0.5 bg-muted/30">
                        {rows.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">
                            —
                          </span>
                        ) : (
                          rows.map((r) => (
                            <Tooltip key={r.section_plan_id}>
                              <TooltipTrigger asChild>
                                <Link
                                  href={`/campaigns/${campaignId}/section-plans/${r.section_plan_id}?step=mapping`}
                                  className="block"
                                >
                                  <Badge
                                    variant={r.any_confirmed ? 'success' : 'info'}
                                    className="w-full justify-between text-[10px] truncate cursor-pointer"
                                  >
                                    <span className="truncate">{r.section_name}</span>
                                    <span className="ml-1 tabular-nums opacity-80">
                                      {r.subject_count}
                                    </span>
                                  </Badge>
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs space-y-0.5">
                                  <p className="font-semibold">{r.section_name}</p>
                                  <p>
                                    {r.subject_count} subject
                                    {r.subject_count === 1 ? '' : 's'} mapped to stage {r.stage_number}
                                  </p>
                                  <p className="text-muted-foreground">
                                    Kinds: {r.subject_kinds.join(', ')}
                                  </p>
                                  {r.avg_confidence != null && (
                                    <p className="text-muted-foreground">
                                      Avg confidence:{' '}
                                      {Math.round(r.avg_confidence * 100)}%
                                    </p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}
