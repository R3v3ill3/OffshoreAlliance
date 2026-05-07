'use client'

import { useMemo } from 'react'
import { Sparkles, Check, X, Trash2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useConfirmStageMapping,
  useDeleteStageMapping,
  useGenerateStageMapping,
  useSectionStageMappings,
  type StageSubjectKind,
} from '@/lib/hooks/useStageMapping'
import { useSectionAmbitions } from '@/lib/hooks/useSectionAmbitions'
import { useSectionActivities } from '@/lib/hooks/useSectionActivities'
import { useSectionWtp } from '@/lib/hooks/useSectionWtpAndCapacities'
import { useSectionCapacities } from '@/lib/hooks/useSectionWtpAndCapacities'
import { useSectionSocs } from '@/lib/hooks/useSectionTheoryAndSoc'

const STAGE_LABELS: Record<number, string> = {
  1: 'Contact ID & Mapping',
  2: 'Intro Comms & Education',
  3: 'Member Mobilisation',
  4: 'Develop Claims / MSD',
  5: 'Endorsement & Commence Bargaining',
  6: 'Bargaining to Win (handover)',
  7: 'Bargaining Commences',
  8: 'Testing the Employer',
  9: 'Strength Assessment & Decision',
  10: 'Protected Industrial Action',
  11: 'Settlement & Ratification',
}

interface StageMappingPanelProps {
  sectionPlanId: number
  campaignId: number
}

export function StageMappingPanel({
  sectionPlanId,
  campaignId,
}: StageMappingPanelProps) {
  const { canWrite } = useAuth()
  const { data: mappings = [], isLoading } = useSectionStageMappings(sectionPlanId)
  const generate = useGenerateStageMapping(sectionPlanId, campaignId)
  const confirm = useConfirmStageMapping()
  const remove = useDeleteStageMapping()

  // Subject lookup tables for human-readable names
  const { data: ambitions = [] } = useSectionAmbitions(sectionPlanId)
  const { data: activities = [] } = useSectionActivities(sectionPlanId)
  const { data: wtp = [] } = useSectionWtp(sectionPlanId)
  const { data: capacities = [] } = useSectionCapacities(sectionPlanId)
  const { data: socs = [] } = useSectionSocs(sectionPlanId)

  const subjectLabel = (kind: StageSubjectKind, id: number): string => {
    if (kind === 'ambition') {
      return ambitions.find((a) => a.ambition_id === id)?.custom_text ?? `ambition ${id}`
    }
    if (kind === 'activity') {
      return activities.find((a) => a.activity_id === id)?.title ?? `activity ${id}`
    }
    if (kind === 'wtp') {
      const r = wtp.find((x) => x.wtp_id === id)
      return r?.option?.option_text ?? r?.custom_text ?? `wtp ${id}`
    }
    if (kind === 'capacity') {
      const r = capacities.find((x) => x.capacity_id === id)
      return r?.option?.option_text ?? r?.custom_text ?? `capacity ${id}`
    }
    if (kind === 'soc') {
      return socs.find((s) => s.soc_id === id)?.name ?? `soc ${id}`
    }
    return `${kind} ${id}`
  }

  const groupedByStage = useMemo(() => {
    const m: Record<number, typeof mappings> = {}
    for (const row of mappings) {
      ;(m[row.stage_number] ??= []).push(row)
    }
    return m
  }, [mappings])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Stage mapping</CardTitle>
            <CardDescription>
              AI-generated map of this section&apos;s ambitions, activities,
              where-to-play rows, capacities, and SOCs back to the 11-stage
              Playing-to-Win framework. Confirm a mapping to keep it across
              future regenerations.
            </CardDescription>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => generate.mutate({})}
                disabled={generate.isPending}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {generate.isPending ? 'Generating…' : 'Generate'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generate.mutate({ regenerate: true })}
                disabled={generate.isPending}
                title="Regenerate (keeps confirmed mappings, replaces unconfirmed)"
              >
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {!isLoading && mappings.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            No mappings yet. Click &ldquo;Generate&rdquo; to ask the AI to map every
            subject in this section back to P2W stages.
          </p>
        )}
        {!isLoading && mappings.length > 0 && (
          <div className="space-y-4">
            {Object.entries(groupedByStage)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([stageStr, rows]) => {
                const stage = Number(stageStr)
                return (
                  <div key={stage} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">Stage {stage}</Badge>
                      <span className="text-sm font-medium">
                        {STAGE_LABELS[stage] ?? '—'}
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="w-32">Confidence</TableHead>
                          <TableHead>Rationale</TableHead>
                          <TableHead className="w-28">Confirmed</TableHead>
                          {canWrite && <TableHead className="w-12" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.mapping_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">
                                  {r.subject_kind}
                                </Badge>
                                <span className="text-sm">
                                  {subjectLabel(r.subject_kind, r.subject_id)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary"
                                    style={{
                                      width: `${(r.confidence ?? 0) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums">
                                  {r.confidence != null
                                    ? `${Math.round(r.confidence * 100)}%`
                                    : '—'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.rationale}
                            </TableCell>
                            <TableCell>
                              {canWrite ? (
                                <Button
                                  variant={r.human_confirmed ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() =>
                                    confirm.mutate({
                                      mapping_id: r.mapping_id,
                                      section_plan_id: sectionPlanId,
                                      human_confirmed: !r.human_confirmed,
                                    })
                                  }
                                >
                                  {r.human_confirmed ? (
                                    <>
                                      <Check className="h-3 w-3 mr-1" />
                                      Confirmed
                                    </>
                                  ) : (
                                    <>
                                      <X className="h-3 w-3 mr-1" />
                                      Unconfirmed
                                    </>
                                  )}
                                </Button>
                              ) : r.human_confirmed ? (
                                <Badge variant="success">Confirmed</Badge>
                              ) : (
                                <Badge variant="secondary">—</Badge>
                              )}
                            </TableCell>
                            {canWrite && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() =>
                                    remove.mutate({
                                      mapping_id: r.mapping_id,
                                      section_plan_id: sectionPlanId,
                                    })
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
