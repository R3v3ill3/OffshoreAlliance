"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, ShieldAlert, CheckCircle, Link2, Target } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { isAmbitionMetricIncomplete } from "@/lib/planning/ambition-metric-status"
import type { PlanAmbition } from "@/types/planner-types"

type AmbitionRow = PlanAmbition & {
  ambition_options?: {
    default_scope?: string | null
    has_variable: boolean | null
    variable_type?: string | null
  } | null
  parent_campaign_ambition_id?: number | null
}

interface AmbitionStageSummaryProps {
  campaignId: number
  stageNumber: number
  ambitions: AmbitionRow[]
}

/**
 * Sticky right-rail summary that surfaces stage-level ambition health at a
 * glance — total count, share with metrics set, hard-gate count, count
 * linked to campaign-level ambitions — plus quick links to the gate page
 * and the campaign-level ambitions section.
 */
export function AmbitionStageSummary({
  campaignId,
  stageNumber,
  ambitions,
}: AmbitionStageSummaryProps) {
  const stats = useMemo(() => {
    const total = ambitions.length
    if (total === 0) {
      return {
        total: 0,
        completePct: null as number | null,
        incomplete: 0,
        hardGates: 0,
        linkedToCampaign: 0,
        achieved: 0,
      }
    }
    const incomplete = ambitions.filter(
      (a) => !a.is_achieved && isAmbitionMetricIncomplete(a)
    ).length
    const completePct = Math.round(((total - incomplete) / total) * 100)
    const hardGates = ambitions.filter((a) => a.is_hard_gate).length
    const linkedToCampaign = ambitions.filter(
      (a) => a.parent_campaign_ambition_id != null
    ).length
    const achieved = ambitions.filter((a) => a.is_achieved).length
    return { total, completePct, incomplete, hardGates, linkedToCampaign, achieved }
  }, [ambitions])

  const completePctClass =
    stats.completePct == null
      ? "text-muted-foreground"
      : stats.completePct >= 80
      ? "text-green-700"
      : stats.completePct >= 40
      ? "text-amber-700"
      : "text-red-700"

  return (
    <Card className="lg:sticky lg:top-4 self-start">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          Stage {stageNumber} ambitions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Totals */}
        <div className="grid grid-cols-2 gap-2">
          <SummaryStat label="Total" value={stats.total} />
          <SummaryStat
            label="Metrics set"
            value={stats.completePct != null ? `${stats.completePct}%` : "—"}
            className={completePctClass}
          />
          <SummaryStat
            label="Hard gates"
            value={stats.hardGates}
            icon={<ShieldAlert className="h-3 w-3" />}
            className={stats.hardGates > 0 ? "text-red-700" : undefined}
          />
          <SummaryStat
            label="Campaign-linked"
            value={stats.linkedToCampaign}
            icon={<Link2 className="h-3 w-3" />}
            className={stats.linkedToCampaign > 0 ? "text-blue-700" : undefined}
          />
        </div>

        {/* Incomplete + achieved indicator pills */}
        <div className="flex flex-wrap gap-1.5">
          {stats.incomplete > 0 && (
            <Badge className="text-[11px] bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200">
              {stats.incomplete} target{stats.incomplete === 1 ? "" : "s"} not set
            </Badge>
          )}
          {stats.achieved > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] border-green-300 text-green-700 bg-green-50"
            >
              <CheckCircle className="h-2.5 w-2.5 mr-1" />
              {stats.achieved} achieved
            </Badge>
          )}
          {stats.linkedToCampaign === 0 && stats.total > 0 && (
            <Badge variant="outline" className="text-[11px] text-muted-foreground">
              No campaign rollup yet
            </Badge>
          )}
        </div>

        {/* Quick links */}
        <div className="space-y-1.5 pt-1">
          <Button asChild variant="outline" size="sm" className="w-full justify-between">
            <Link href={`/campaigns/${campaignId}/plan/gate/${stageNumber}`}>
              Gate {stageNumber} assessment
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full justify-between">
            <Link href={`/campaigns/${campaignId}/settings`}>
              Campaign-level ambitions
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryStat({
  label,
  value,
  icon,
  className,
}: {
  label: string
  value: string | number
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-slate-50/60 p-2",
        className
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  )
}
