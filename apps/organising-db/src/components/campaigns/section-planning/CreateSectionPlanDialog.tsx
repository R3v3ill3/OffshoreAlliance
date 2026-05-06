'use client'

import { useState } from 'react'
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
import { useCreateSectionPlan } from '@/lib/hooks/useSectionPlans'
import {
  SECTION_PLAN_TIMEFRAME_KINDS,
  SECTION_PLAN_TIMEFRAME_KIND_DESCRIPTIONS,
  SECTION_PLAN_TIMEFRAME_KIND_LABELS,
  type SectionPlanTimeframeKind,
} from '@/types/section-planning'

interface CreateSectionPlanDialogProps {
  campaignId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (sectionPlanId: number) => void
}

interface FormState {
  name: string
  purpose: string
  start_date: string
  end_date: string
  timeframe_kind: SectionPlanTimeframeKind
  external_anchor_label: string
}

const INITIAL_FORM: FormState = {
  name: '',
  purpose: '',
  start_date: '',
  end_date: '',
  timeframe_kind: 'user_set',
  external_anchor_label: '',
}

export function CreateSectionPlanDialog({
  campaignId,
  open,
  onOpenChange,
  onCreated,
}: CreateSectionPlanDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const create = useCreateSectionPlan()

  const showAnchor = form.timeframe_kind !== 'user_set'

  const datesValid =
    !!form.start_date &&
    !!form.end_date &&
    form.end_date >= form.start_date

  const canSubmit =
    !!form.name.trim() &&
    datesValid &&
    !create.isPending

  const reset = () => setForm(INITIAL_FORM)

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      const created = await create.mutateAsync({
        campaign_id: campaignId,
        name: form.name.trim(),
        purpose: form.purpose.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
        timeframe_kind: form.timeframe_kind,
        external_anchor_label:
          showAnchor && form.external_anchor_label.trim()
            ? form.external_anchor_label.trim()
            : null,
      })
      reset()
      onOpenChange(false)
      onCreated?.(created.section_plan_id)
    } catch {
      // useAuthAwareMutation surfaces errors via the mutation result; UI
      // shows the inline error block below. Nothing to do here.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New section plan</DialogTitle>
          <DialogDescription>
            A stripped-back plan for a discrete period of work — situation,
            ambitions, where to play, activities. Sits alongside the full
            campaign plan; it does not change stage progression.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="sp-name">Name *</Label>
            <Input
              id="sp-name"
              value={form.name}
              placeholder="e.g. Pre-ballot surge — Rankin North"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-purpose">Purpose</Label>
            <Textarea
              id="sp-purpose"
              rows={2}
              value={form.purpose}
              placeholder="One or two sentences on why this period needs its own plan."
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sp-start">Start *</Label>
              <Input
                id="sp-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-end">End *</Label>
              <Input
                id="sp-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          {!datesValid && form.start_date && form.end_date && (
            <p className="text-xs text-destructive">
              End date must be on or after the start date.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="sp-tf">Timeframe kind</Label>
            <Select
              value={form.timeframe_kind}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  timeframe_kind: value as SectionPlanTimeframeKind,
                  external_anchor_label:
                    value === 'user_set' ? '' : form.external_anchor_label,
                })
              }
            >
              <SelectTrigger id="sp-tf">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_PLAN_TIMEFRAME_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {SECTION_PLAN_TIMEFRAME_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SECTION_PLAN_TIMEFRAME_KIND_DESCRIPTIONS[form.timeframe_kind]}
            </p>
          </div>

          {showAnchor && (
            <div className="space-y-2">
              <Label htmlFor="sp-anchor">External anchor</Label>
              <Input
                id="sp-anchor"
                value={form.external_anchor_label}
                placeholder={
                  form.timeframe_kind === 'hard_external_deadline'
                    ? 'e.g. EBA ballot opens 12 May'
                    : 'e.g. First bargaining meeting 21 May'
                }
                onChange={(e) =>
                  setForm({ ...form, external_anchor_label: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Optional but recommended — names the external event the dates
                are anchored to.
              </p>
            </div>
          )}

          {create.isError && (
            <p className="text-xs text-destructive">
              Could not create section plan: {(create.error as Error)?.message ?? 'unknown error'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create section plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
