'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateSectionPlan } from '@/lib/hooks/useSectionPlans'
import {
  SECTION_PLAN_STATUSES,
  SECTION_PLAN_STATUS_LABELS,
  SECTION_PLAN_TIMEFRAME_KINDS,
  SECTION_PLAN_TIMEFRAME_KIND_DESCRIPTIONS,
  SECTION_PLAN_TIMEFRAME_KIND_LABELS,
  type SectionPlanRow,
  type SectionPlanStatus,
  type SectionPlanTimeframeKind,
} from '@/types/section-planning'

interface EditSectionPlanDialogProps {
  sectionPlan: SectionPlanRow
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditSectionPlanDialog({
  sectionPlan,
  open,
  onOpenChange,
}: EditSectionPlanDialogProps) {
  const [name, setName] = useState(sectionPlan.name)
  const [purpose, setPurpose] = useState(sectionPlan.purpose ?? '')
  const [startDate, setStartDate] = useState(sectionPlan.start_date)
  const [endDate, setEndDate] = useState(sectionPlan.end_date)
  const [timeframeKind, setTimeframeKind] = useState<SectionPlanTimeframeKind>(
    sectionPlan.timeframe_kind,
  )
  const [anchor, setAnchor] = useState(sectionPlan.external_anchor_label ?? '')
  const [status, setStatus] = useState<SectionPlanStatus>(sectionPlan.status)
  const update = useUpdateSectionPlan()

  // When the dialog reopens with a different plan, reset state.
  useEffect(() => {
    if (open) {
      setName(sectionPlan.name)
      setPurpose(sectionPlan.purpose ?? '')
      setStartDate(sectionPlan.start_date)
      setEndDate(sectionPlan.end_date)
      setTimeframeKind(sectionPlan.timeframe_kind)
      setAnchor(sectionPlan.external_anchor_label ?? '')
      setStatus(sectionPlan.status)
    }
  }, [open, sectionPlan])

  const datesValid = !!startDate && !!endDate && endDate >= startDate
  const showAnchor = timeframeKind !== 'user_set'
  const canSubmit = !!name.trim() && datesValid && !update.isPending

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      await update.mutateAsync({
        section_plan_id: sectionPlan.section_plan_id,
        name: name.trim(),
        purpose: purpose.trim() || null,
        start_date: startDate,
        end_date: endDate,
        timeframe_kind: timeframeKind,
        external_anchor_label:
          showAnchor && anchor.trim() ? anchor.trim() : null,
        status,
      })
      onOpenChange(false)
    } catch {
      // Error surfaced inline via the mutation result.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit section plan</DialogTitle>
          <DialogDescription>
            Update name, dates, timeframe kind, or status. Status changes
            between draft / active / completed are non-destructive; archive uses
            the dedicated archive button.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="esp-name">Name</Label>
            <Input
              id="esp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="esp-purpose">Purpose</Label>
            <Textarea
              id="esp-purpose"
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="esp-start">Start</Label>
              <Input
                id="esp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="esp-end">End</Label>
              <Input
                id="esp-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {!datesValid && (
            <p className="text-xs text-destructive">
              End date must be on or after the start date.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="esp-tf">Timeframe kind</Label>
            <Select
              value={timeframeKind}
              onValueChange={(v) => {
                setTimeframeKind(v as SectionPlanTimeframeKind)
                if (v === 'user_set') setAnchor('')
              }}
            >
              <SelectTrigger id="esp-tf">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_PLAN_TIMEFRAME_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SECTION_PLAN_TIMEFRAME_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SECTION_PLAN_TIMEFRAME_KIND_DESCRIPTIONS[timeframeKind]}
            </p>
          </div>

          {showAnchor && (
            <div className="space-y-2">
              <Label htmlFor="esp-anchor">External anchor</Label>
              <Input
                id="esp-anchor"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="esp-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as SectionPlanStatus)}
            >
              <SelectTrigger id="esp-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_PLAN_STATUSES.filter((s) => s !== 'archived').map((s) => (
                  <SelectItem key={s} value={s}>
                    {SECTION_PLAN_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {update.isError && (
            <p className="text-xs text-destructive">
              {(update.error as Error)?.message ?? 'Could not update'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
