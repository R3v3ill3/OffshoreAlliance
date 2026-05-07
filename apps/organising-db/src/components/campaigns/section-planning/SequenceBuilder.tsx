'use client'

import { useState } from 'react'
import { Plus, Trash2, ArrowRight, Play, Zap } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useCreateSequence,
  useCreateSequenceStep,
  useDeleteSequence,
  useDeleteSequenceStep,
  useMaterialiseRun,
  useSequenceRuns,
  useSequenceSteps,
  useSequences,
  useStepTriggers,
  type SequenceTargetKind,
  type SequenceThresholdKind,
} from '@/lib/hooks/useActivitySequences'
import type { SectionActivityRow } from '@/lib/hooks/useSectionActivities'

const TARGET_KIND_OPTIONS: { key: SequenceTargetKind; label: string }[] = [
  { key: 'phone_call_list', label: 'Phone call list' },
  { key: 'sms_blast', label: 'SMS blast' },
  { key: 'email_survey', label: 'Email survey' },
  { key: 'task', label: 'Task / activist tasking' },
  { key: 'site_visit', label: 'Site visit' },
  { key: 'woc_meeting', label: 'WOC meeting' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'industrial_action', label: 'Industrial action' },
]

interface AddStepFormProps {
  sequenceId: number
  activities: SectionActivityRow[]
  existingStepCount: number
  open: boolean
  onClose: () => void
}

function AddStepForm({
  sequenceId,
  activities,
  existingStepCount,
  open,
  onClose,
}: AddStepFormProps) {
  const create = useCreateSequenceStep()
  const [sourceId, setSourceId] = useState('')
  const [targetKind, setTargetKind] = useState<SequenceTargetKind>('sms_blast')
  const [templateKey, setTemplateKey] = useState('')
  const [eventKind, setEventKind] = useState('call_attempt')
  const [outcome, setOutcome] = useState('no_answer')
  const [thresholdKind, setThresholdKind] =
    useState<SequenceThresholdKind>('percent_of_target')
  const [thresholdValue, setThresholdValue] = useState('40')

  const reset = () => {
    setSourceId('')
    setTargetKind('sms_blast')
    setTemplateKey('')
    setEventKind('call_attempt')
    setOutcome('no_answer')
    setThresholdKind('percent_of_target')
    setThresholdValue('40')
  }

  const submit = async () => {
    await create.mutateAsync({
      sequence_id: sequenceId,
      step_order: existingStepCount + 1,
      source_activity_id: sourceId ? Number(sourceId) : null,
      target_activity_template_key: templateKey.trim() || targetKind,
      target_activity_kind: targetKind,
      target_payload: {},
      delay_minutes: 0,
      trigger: {
        event_kind: eventKind.trim(),
        outcome: outcome.trim() || null,
        threshold_kind: thresholdKind,
        threshold_value: thresholdValue ? Number(thresholdValue) : null,
      },
    })
    reset()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add step</DialogTitle>
          <DialogDescription>
            A step describes a downstream activity that should be created when
            the trigger matches activity events on the source activity.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Source activity</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a source activity" />
              </SelectTrigger>
              <SelectContent>
                {activities.map((a) => (
                  <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                    {a.title} ({a.activity_kind})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Target kind</Label>
              <Select
                value={targetKind}
                onValueChange={(v) => setTargetKind(v as SequenceTargetKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="seq-template">Template key</Label>
              <Input
                id="seq-template"
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
                placeholder="Defaults to target kind"
              />
            </div>
          </div>
          <div className="rounded-md border p-3 space-y-2.5 bg-muted/40">
            <p className="text-xs uppercase font-semibold text-muted-foreground">
              Trigger
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="seq-event-kind">Event kind</Label>
                <Input
                  id="seq-event-kind"
                  value={eventKind}
                  onChange={(e) => setEventKind(e.target.value)}
                  placeholder="call_attempt · sms_reply · …"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="seq-outcome">Outcome (optional)</Label>
                <Input
                  id="seq-outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="no_answer · yes · …"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Threshold</Label>
                <Select
                  value={thresholdKind}
                  onValueChange={(v) =>
                    setThresholdKind(v as SequenceThresholdKind)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any (fire on first match)</SelectItem>
                    <SelectItem value="absolute_count">
                      Absolute count
                    </SelectItem>
                    <SelectItem value="percent_of_target">
                      % of source events
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="seq-thresh">Value</Label>
                <Input
                  id="seq-thresh"
                  type="number"
                  step="any"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  disabled={thresholdKind === 'any'}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Example: phone-call list → trigger on{' '}
              <span className="font-mono">call_attempt</span> outcome{' '}
              <span className="font-mono">no_answer</span> ≥ 40% → SMS blast.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!sourceId || create.isPending}>
            {create.isPending ? 'Saving…' : 'Add step'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SequenceCardProps {
  sectionPlanId: number
  sequenceId: number
  name: string
  description: string | null
  activities: SectionActivityRow[]
  canWrite: boolean
}

function SequenceCard({
  sectionPlanId,
  sequenceId,
  name,
  description,
  activities,
  canWrite,
}: SequenceCardProps) {
  const { data: steps = [] } = useSequenceSteps(sequenceId)
  const { data: runs = [] } = useSequenceRuns(sequenceId)
  const removeSeq = useDeleteSequence()
  const removeStep = useDeleteSequenceStep()
  const materialise = useMaterialiseRun()
  const [addStepOpen, setAddStepOpen] = useState(false)

  const activityById = new Map(activities.map((a) => [a.activity_id, a]))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm">{name}</CardTitle>
            {description && (
              <CardDescription className="text-xs">{description}</CardDescription>
            )}
          </div>
          {canWrite && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setAddStepOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Step
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete sequence?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deletes the sequence and all its steps + triggers. Runs are also removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        removeSeq.mutate({
                          sequence_id: sequenceId,
                          section_plan_id: sectionPlanId,
                        })
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No steps yet. Add a step to start chaining activities.
          </p>
        )}
        {steps.map((s) => (
          <StepRow
            key={s.step_id}
            step={s}
            activity={s.source_activity_id ? activityById.get(s.source_activity_id) : null}
            canWrite={canWrite}
            onDelete={() =>
              removeStep.mutate({ step_id: s.step_id, sequence_id: sequenceId })
            }
          />
        ))}

        {runs.length > 0 && (
          <div className="pt-2 mt-2 border-t space-y-1.5">
            <p className="text-xs uppercase font-semibold text-muted-foreground">
              Runs
            </p>
            <ul className="space-y-1.5">
              {runs.map((r) => (
                <li
                  key={r.run_id}
                  className="text-xs flex items-center justify-between gap-2 rounded border p-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        r.state === 'queued'
                          ? 'warning'
                          : r.state === 'materialised'
                            ? 'success'
                            : r.state === 'failed'
                              ? 'destructive'
                              : 'secondary'
                      }
                    >
                      {r.state}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(r.triggered_at).toLocaleString()}
                    </span>
                  </div>
                  {r.state === 'queued' && canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        materialise.mutate({ run_id: r.run_id, sequence_id: sequenceId })
                      }
                      disabled={materialise.isPending}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Run now
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <AddStepForm
        sequenceId={sequenceId}
        activities={activities}
        existingStepCount={steps.length}
        open={addStepOpen}
        onClose={() => setAddStepOpen(false)}
      />
    </Card>
  )
}

interface StepRowProps {
  step: ReturnType<typeof useSequenceSteps>['data'] extends infer R
    ? R extends Array<infer T>
      ? T
      : never
    : never
  activity: SectionActivityRow | null | undefined
  canWrite: boolean
  onDelete: () => void
}

function StepRow({ step, activity, canWrite, onDelete }: StepRowProps) {
  const { data: triggers = [] } = useStepTriggers(step.step_id)

  return (
    <div className="rounded-md border p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <Badge variant="secondary">{step.step_order}</Badge>
          <span className="font-medium">
            {activity?.title ?? <em className="text-muted-foreground">unattached</em>}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant="info">{step.target_activity_kind}</Badge>
          <span className="text-xs text-muted-foreground font-mono">
            {step.target_activity_template_key}
          </span>
        </div>
        {canWrite && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {triggers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs pl-2">
          {triggers.map((t) => (
            <Badge key={t.trigger_id} variant="outline" className="text-[10px]">
              <Zap className="h-2.5 w-2.5 mr-1" />
              {t.event_kind}
              {t.outcome ? ` · ${t.outcome}` : ''}{' '}
              {t.threshold_kind === 'any'
                ? '· any'
                : t.threshold_kind === 'absolute_count'
                  ? `· ≥${t.threshold_value}`
                  : `· ≥${t.threshold_value}%`}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export function SequenceBuilder({
  sectionPlanId,
  activities,
}: {
  sectionPlanId: number
  activities: SectionActivityRow[]
}) {
  const { canWrite } = useAuth()
  const { data: sequences = [] } = useSequences(sectionPlanId)
  const create = useCreateSequence()
  const [newOpen, setNewOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Activity sequences</CardTitle>
            <CardDescription>
              Chain a follow-up activity (e.g. SMS blast) onto an upstream
              activity (e.g. phone wave). Triggers fire when matching activity
              events accumulate; queued runs can be materialised one-click or
              by the cron job.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New sequence
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sequences.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sequences yet. Add a sequence to chain a follow-up onto one of
            your activities.
          </p>
        )}
        {sequences.map((s) => (
          <SequenceCard
            key={s.sequence_id}
            sectionPlanId={sectionPlanId}
            sequenceId={s.sequence_id}
            name={s.name}
            description={s.description}
            activities={activities}
            canWrite={!!canWrite}
          />
        ))}
      </CardContent>

      <Dialog open={newOpen} onOpenChange={(o) => !o && setNewOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New sequence</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="seq-name">Name</Label>
              <Input
                id="seq-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Phone wave → SMS fallback"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="seq-desc">Description</Label>
              <Input
                id="seq-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!name.trim()) return
                await create.mutateAsync({
                  section_plan_id: sectionPlanId,
                  name: name.trim(),
                  description: description.trim() || null,
                })
                setName('')
                setDescription('')
                setNewOpen(false)
              }}
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
