"use client"

import Link from "next/link"
import { useMemo } from "react"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { Lock, Unlock, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { STAGE_NAMES } from "@/types/planner-types"

interface StageRow {
  stage_number: number
  status: string
  planned_start_date: string | null
  planned_end_date: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
}

interface GateRow {
  gate_number: number
  enforcement_type: string | null
  is_active: boolean | null
}

interface StageTimelineGanttProps {
  campaignId: number
  stages: StageRow[]
  gates: GateRow[]
}

const STAGE_COLORS: Record<string, string> = {
  active: "bg-blue-500/80 ring-blue-300",
  completed: "bg-green-500/70 ring-green-300",
  blocked: "bg-red-500/80 ring-red-300",
  draft: "bg-slate-300/80 ring-slate-200",
}

interface OverlapPair {
  stageA: number
  stageB: number
  /** Days of overlap (positive = stages overlap; 0 = touch; negative = gap). */
  overlapDays: number
  /** Hard active gate sits between them — overlap is locked at the DB level. */
  hardGated: boolean
}

function detectOverlaps(stages: StageRow[], gates: GateRow[]): OverlapPair[] {
  const sorted = [...stages].sort((a, b) => a.stage_number - b.stage_number)
  const pairs: OverlapPair[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (
      !a.planned_end_date ||
      !b.planned_start_date ||
      !a.planned_start_date ||
      !b.planned_end_date
    ) {
      continue
    }
    const aEnd = parseISO(a.planned_end_date)
    const bStart = parseISO(b.planned_start_date)
    const overlapDays = differenceInCalendarDays(aEnd, bStart)
    const gate = gates.find((g) => g.gate_number === a.stage_number)
    const hardGated = gate?.enforcement_type === "hard" && gate.is_active === true
    pairs.push({
      stageA: a.stage_number,
      stageB: b.stage_number,
      overlapDays,
      hardGated,
    })
  }
  return pairs
}

/**
 * Gantt-style timeline showing each stage as a date-aligned bar so overlaps
 * are visible at a glance. Sits alongside the existing CampaignTimeline (which
 * is a status-only step view) — together they cover both spatial and status
 * perspectives.
 *
 * Hard-gated boundaries render with a lock icon; soft-gated overlaps render
 * with an unlock icon and an amber overlap-days badge so users can see at a
 * glance which boundaries are locked vs deliberate.
 */
export function StageTimelineGantt({
  campaignId,
  stages,
  gates,
}: StageTimelineGanttProps) {
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.stage_number - b.stage_number),
    [stages]
  )

  const dateBounds = useMemo(() => {
    const dates: Date[] = []
    for (const s of sortedStages) {
      if (s.planned_start_date) dates.push(parseISO(s.planned_start_date))
      if (s.planned_end_date) dates.push(parseISO(s.planned_end_date))
    }
    if (dates.length < 2) return null
    const min = dates.reduce((a, b) => (a < b ? a : b))
    const max = dates.reduce((a, b) => (a > b ? a : b))
    const totalDays = Math.max(1, differenceInCalendarDays(max, min))
    return { min, max, totalDays }
  }, [sortedStages])

  const overlaps = useMemo(
    () => detectOverlaps(sortedStages, gates),
    [sortedStages, gates]
  )

  if (!dateBounds) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Stage dates haven&apos;t been set yet — once start &amp; end dates exist for
        at least two stages, the Gantt view will appear here.
      </div>
    )
  }

  function pctOf(d: Date): number {
    return (
      (differenceInCalendarDays(d, dateBounds!.min) / dateBounds!.totalDays) * 100
    )
  }

  return (
    <div className="space-y-3">
      {/* Date axis */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>{format(dateBounds.min, "dd MMM yyyy")}</span>
        <span>{format(dateBounds.max, "dd MMM yyyy")}</span>
      </div>

      {/* Stage rows */}
      <div className="space-y-1.5">
        {sortedStages.map((stage) => {
          const start = stage.planned_start_date
            ? parseISO(stage.planned_start_date)
            : null
          const end = stage.planned_end_date
            ? parseISO(stage.planned_end_date)
            : null
          const colorClass =
            STAGE_COLORS[stage.status] ?? STAGE_COLORS.draft
          const startPct = start ? pctOf(start) : 0
          const endPct = end ? pctOf(end) : 0
          const widthPct = Math.max(2, endPct - startPct)

          return (
            <div
              key={stage.stage_number}
              className="flex items-center gap-2 text-xs"
            >
              <div className="w-32 shrink-0 truncate">
                <span className="font-medium">Stage {stage.stage_number}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {STAGE_NAMES[stage.stage_number as keyof typeof STAGE_NAMES] ??
                    "—"}
                </span>
              </div>
              <div className="relative flex-1 h-7 bg-slate-50 rounded">
                {start && end ? (
                  <Link
                    href={`/campaigns/${campaignId}/plan/stage/${stage.stage_number}`}
                    title={`${format(start, "dd MMM")} → ${format(end, "dd MMM yyyy")}`}
                    className={cn(
                      "absolute top-0 bottom-0 rounded ring-1 hover:opacity-95 transition-opacity",
                      colorClass
                    )}
                    style={{
                      left: `${startPct}%`,
                      width: `${widthPct}%`,
                    }}
                  >
                    <span className="sr-only">
                      Stage {stage.stage_number}: {format(start, "dd MMM")} to{" "}
                      {format(end, "dd MMM yyyy")}
                    </span>
                  </Link>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                    No dates set
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Overlap / gate-lock summary */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {overlaps.map((p) => {
          const overlapping = p.overlapDays > 0
          if (!overlapping && !p.hardGated) return null
          const Icon = p.hardGated ? Lock : Unlock
          const className = p.hardGated
            ? "border-blue-300 bg-blue-50 text-blue-900"
            : overlapping
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-slate-50 text-slate-600"
          return (
            <span
              key={`${p.stageA}-${p.stageB}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                className
              )}
              title={
                p.hardGated
                  ? `Gate ${p.stageA} is hard + active — stages ${p.stageA}/${p.stageB} cannot overlap`
                  : overlapping
                  ? `${p.overlapDays}d overlap between stages ${p.stageA} and ${p.stageB}`
                  : ""
              }
            >
              <Icon className="h-3 w-3" />
              {p.hardGated
                ? `Gate ${p.stageA} locked`
                : `${p.overlapDays}d overlap · stages ${p.stageA}/${p.stageB}`}
            </span>
          )
        })}
        {overlaps.some((p) => p.overlapDays > 0 && !p.hardGated) && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">
            <AlertTriangle className="h-3 w-3" />
            Overlapping stages — fine while their gate stays soft, blocked once
            you flip it to hard.
          </span>
        )}
      </div>
    </div>
  )
}
