'use client'

import { useEffect, useState } from 'react'
import { addDays, differenceInDays, format, isValid, parseISO } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { STAGE_NAMES } from '@/types/planner-types'
import {
  useSyncAmbitionTargetDatesForCampaign,
  useUpdateCampaignStagePlans,
} from '@/lib/hooks/usePlannerCampaigns'

// ── types ────────────────────────────────────────────────────────────────────

type StageRow = {
  plan_id: number
  stage_number: number
  planned_start_date: string | null
  planned_end_date: string | null
}

type DraftRow = {
  plan_id: number
  stage_number: number
  start: string       // ISO yyyy-MM-dd
  end: string         // ISO yyyy-MM-dd
  durationDays: number
  durationWeeks: number
}

type PendingEdit =
  | { kind: 'start'; stageIndex: number; prevStart: string; newStart: string }

// ── helpers ──────────────────────────────────────────────────────────────────

function safeDiff(start: string, end: string): number {
  if (!start || !end) return 0
  const s = parseISO(start)
  const e = parseISO(end)
  if (!isValid(s) || !isValid(e)) return 0
  return Math.max(0, differenceInDays(e, s))
}

function roundWeeks(days: number): number {
  return Math.round((days / 7) * 10) / 10
}

function buildDraft(rows: StageRow[]): DraftRow[] {
  return rows.map((s) => {
    const days = safeDiff(s.planned_start_date ?? '', s.planned_end_date ?? '')
    return {
      plan_id: s.plan_id,
      stage_number: s.stage_number,
      start: s.planned_start_date ?? '',
      end: s.planned_end_date ?? '',
      durationDays: days,
      durationWeeks: roundWeeks(days),
    }
  })
}

/** Cascade from stageIndex forward using each stage's stored durationDays */
function cascadeFrom(draft: DraftRow[], fromIdx: number): DraftRow[] {
  const next = [...draft]
  for (let i = fromIdx + 1; i < next.length; i++) {
    const prevEnd = next[i - 1].end
    if (!prevEnd) continue
    next[i] = {
      ...next[i],
      start: prevEnd,
      end: next[i].durationDays > 0
        ? format(addDays(parseISO(prevEnd), next[i].durationDays), 'yyyy-MM-dd')
        : '',
    }
  }
  return next
}

function setDuration(row: DraftRow, days: number): DraftRow {
  const d = Math.max(1, days)
  const newEnd = row.start
    ? format(addDays(parseISO(row.start), d), 'yyyy-MM-dd')
    : ''
  return { ...row, durationDays: d, durationWeeks: roundWeeks(d), end: newEnd }
}

// ── component ─────────────────────────────────────────────────────────────────

export function CampaignStageDatesEditor({
  campaignId,
  stages,
}: {
  campaignId: number
  stages: StageRow[]
}) {
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [overlaps, setOverlaps] = useState<Set<number>>(new Set())
  const [pending, setPending] = useState<PendingEdit | null>(null)
  // Track week input strings separately to allow decimal editing
  const [weekInputs, setWeekInputs] = useState<Record<number, string>>({})

  const updateMutation = useUpdateCampaignStagePlans()
  const syncMutation = useSyncAmbitionTargetDatesForCampaign()

  // Initialise from props
  useEffect(() => {
    const d = buildDraft(
      [...stages].sort((a, b) => a.stage_number - b.stage_number)
    )
    setDraft(d)
    const init: Record<number, string> = {}
    d.forEach((r) => { init[r.plan_id] = String(r.durationWeeks) })
    setWeekInputs(init)
    setOverlaps(new Set())
  }, [stages])

  // ── campaign start date ───────────────────────────────────────────────────

  function handleCampaignStartChange(iso: string) {
    if (!iso || draft.length === 0) return
    setDraft((prev) => {
      const next = prev.map((r, i) => {
        if (i === 0) {
          const newEnd = r.durationDays > 0
            ? format(addDays(parseISO(iso), r.durationDays), 'yyyy-MM-dd')
            : ''
          return { ...r, start: iso, end: newEnd }
        }
        return r
      })
      return cascadeFrom(next, 0)
    })
    setOverlaps(new Set())
  }

  // ── per-stage changes ─────────────────────────────────────────────────────

  function handleStartChange(idx: number, newStart: string) {
    if (!newStart) return
    const row = draft[idx]
    if (idx > 0) {
      const prevEnd = draft[idx - 1].end
      if (prevEnd && newStart < prevEnd) {
        setPending({ kind: 'start', stageIndex: idx, prevStart: row.start, newStart })
        return
      }
    }
    applyStartChange(idx, newStart)
  }

  function applyStartChange(idx: number, newStart: string) {
    setDraft((prev) => {
      const next = [...prev]
      const days = safeDiff(newStart, next[idx].end)
      next[idx] = {
        ...next[idx],
        start: newStart,
        durationDays: days,
        durationWeeks: roundWeeks(days),
      }
      return next
    })
    setWeekInputs((w) => ({ ...w, [draft[idx].plan_id]: String(roundWeeks(safeDiff(newStart, draft[idx].end))) }))
  }

  function handleEndChange(idx: number, newEnd: string) {
    if (!newEnd) return
    setDraft((prev) => {
      const next = [...prev]
      const days = safeDiff(next[idx].start, newEnd)
      next[idx] = {
        ...next[idx],
        end: newEnd,
        durationDays: days,
        durationWeeks: roundWeeks(days),
      }
      return cascadeFrom(next, idx)
    })
    setWeekInputs((w) => ({ ...w, [draft[idx].plan_id]: String(roundWeeks(safeDiff(draft[idx].start, newEnd))) }))
    // Clear any overlap for this stage if it's now resolved
    setOverlaps((prev) => {
      if (idx + 1 < draft.length) {
        const next = new Set(prev)
        next.delete(draft[idx + 1].stage_number)
        return next
      }
      return prev
    })
  }

  function handleDaysChange(idx: number, rawDays: string) {
    const days = parseInt(rawDays, 10)
    if (isNaN(days) || days < 1) return
    setDraft((prev) => {
      const next = [...prev]
      next[idx] = setDuration(next[idx], days)
      return cascadeFrom(next, idx)
    })
    setWeekInputs((w) => ({ ...w, [draft[idx].plan_id]: String(roundWeeks(days)) }))
  }

  function handleWeeksInput(idx: number, raw: string) {
    const planId = draft[idx].plan_id
    setWeekInputs((w) => ({ ...w, [planId]: raw }))
  }

  function handleWeeksCommit(idx: number) {
    const planId = draft[idx].plan_id
    const wStr = weekInputs[planId] ?? ''
    const weeks = parseFloat(wStr)
    if (isNaN(weeks) || weeks < 0.1) {
      // Revert
      setWeekInputs((w) => ({ ...w, [planId]: String(draft[idx].durationWeeks) }))
      return
    }
    const days = Math.round(weeks * 7)
    setDraft((prev) => {
      const next = [...prev]
      next[idx] = setDuration(next[idx], days)
      return cascadeFrom(next, idx)
    })
    setWeekInputs((w) => ({ ...w, [planId]: String(roundWeeks(days)) }))
  }

  // ── overlap dialog resolution ─────────────────────────────────────────────

  function resolveKeepOriginal() {
    setPending(null)
  }

  function resolveAllowOverlap() {
    if (!pending) return
    const { stageIndex, newStart } = pending
    const sn = draft[stageIndex].stage_number
    const prevSn = draft[stageIndex - 1]?.stage_number
    setDraft((prev) => {
      const next = [...prev]
      const days = safeDiff(newStart, next[stageIndex].end)
      next[stageIndex] = { ...next[stageIndex], start: newStart, durationDays: days, durationWeeks: roundWeeks(days) }
      return next
    })
    setOverlaps((prev) => {
      const next = new Set(prev)
      if (prevSn) next.add(prevSn)
      next.add(sn)
      return next
    })
    setPending(null)
  }

  function resolveMovePrevEnd() {
    if (!pending) return
    const { stageIndex, newStart } = pending
    setDraft((prev) => {
      const next = [...prev]
      // Move previous stage's end to match new start
      const prevIdx = stageIndex - 1
      const prevDays = safeDiff(next[prevIdx].start, newStart)
      next[prevIdx] = {
        ...next[prevIdx],
        end: newStart,
        durationDays: prevDays,
        durationWeeks: roundWeeks(prevDays),
      }
      // Update current stage start / duration
      const days = safeDiff(newStart, next[stageIndex].end)
      next[stageIndex] = { ...next[stageIndex], start: newStart, durationDays: days, durationWeeks: roundWeeks(days) }
      return next
    })
    setWeekInputs((w) => {
      const prevRow = draft[stageIndex - 1]
      const prevDays = safeDiff(prevRow.start, newStart)
      return { ...w, [prevRow.plan_id]: String(roundWeeks(prevDays)) }
    })
    setOverlaps((prev) => {
      const next = new Set(prev)
      next.delete(draft[stageIndex].stage_number)
      if (stageIndex - 1 >= 0) next.delete(draft[stageIndex - 1].stage_number)
      return next
    })
    setPending(null)
  }

  // ── save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        campaign_id: campaignId,
        updates: draft.map((r) => ({
          plan_id: r.plan_id,
          planned_start_date: r.start || null,
          planned_end_date: r.end || null,
        })),
      })
      toast.success(
        'Stage dates saved. Ambition target dates synced where not manually overridden.'
      )
    } catch {
      toast.error('Could not save stage dates')
    }
  }

  async function handleSyncOnly() {
    try {
      await syncMutation.mutateAsync(campaignId)
      toast.success('Ambition target dates updated from each stage planned end date.')
    } catch {
      toast.error('Could not sync ambition dates')
    }
  }

  if (!stages.length) return null

  const campaignStart = draft[0]?.start ?? ''

  return (
    <div className="space-y-5">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={handleSyncOnly} disabled={syncMutation.isPending}>
          Sync ambition deadlines from stages
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          Save dates
        </Button>
      </div>

      {/* Campaign start date */}
      <div className="space-y-1 pb-3 border-b">
        <Label className="text-sm font-semibold">Campaign start date</Label>
        <p className="text-xs text-muted-foreground">
          Stage 1 begins on this date. Changing it cascades all subsequent stage dates.
        </p>
        <div className="max-w-[180px]">
          <DateInput value={campaignStart} onChange={handleCampaignStartChange} />
        </div>
      </div>

      {/* Stage rows */}
      <div className="space-y-4">
        {draft.map((r, idx) => {
          const sn = r.stage_number
          const hasOverlap = overlaps.has(sn)
          const nextStageStart = draft[idx + 1]?.start ?? null

          return (
            <div key={r.plan_id} className="space-y-2">
              {/* Stage label row */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {sn}
                </div>
                <p className="text-sm font-medium">{STAGE_NAMES[sn as keyof typeof STAGE_NAMES]}</p>
                {hasOverlap && (
                  <span className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Overlapping with adjacent stage
                    {nextStageStart && (
                      <> — ambitions with target date after {format(parseISO(nextStageStart), 'dd/MM/yyyy')} cannot be hard gates</>
                    )}
                  </span>
                )}
              </div>

              {/* Date + duration fields */}
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_90px_90px] gap-2 items-end pl-8">
                <div className="space-y-1">
                  <Label className="text-xs">Planned start</Label>
                  <DateInput value={r.start} onChange={(v) => handleStartChange(idx, v)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Planned end</Label>
                  <DateInput value={r.end} onChange={(v) => handleEndChange(idx, v)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Days</Label>
                  <Input
                    type="number"
                    min={1}
                    value={r.durationDays || ''}
                    onChange={(e) => handleDaysChange(idx, e.target.value)}
                    className="text-center"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Weeks</Label>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={weekInputs[r.plan_id] ?? r.durationWeeks}
                    onChange={(e) => handleWeeksInput(idx, e.target.value)}
                    onBlur={() => handleWeeksCommit(idx)}
                    className="text-center"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Overlap dialog */}
      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) resolveKeepOriginal() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Stage date overlap
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                {pending && (() => {
                  const prevRow = draft[pending.stageIndex - 1]
                  const curRow = draft[pending.stageIndex]
                  return (
                    <>
                      <p>
                        The new start date for <strong>Stage {curRow.stage_number}</strong> (
                        {format(parseISO(pending.newStart), 'dd/MM/yyyy')}) is before the planned
                        end of <strong>Stage {prevRow.stage_number}</strong> (
                        {format(parseISO(prevRow.end), 'dd/MM/yyyy')}).
                      </p>
                      <p className="text-amber-700">
                        Note: ambitions whose target date falls after Stage {curRow.stage_number}&apos;s
                        planned start cannot be set as hard gates.
                      </p>
                    </>
                  )
                })()}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={resolveKeepOriginal}>
              Keep original date
            </Button>
            <Button variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50" onClick={resolveAllowOverlap}>
              Allow overlap
            </Button>
            <Button onClick={resolveMovePrevEnd}>
              Move previous stage end to match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
